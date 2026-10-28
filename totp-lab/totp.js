// TOTP Lab — client-side TOTP/HOTP (RFC 4226 / RFC 6238), WebCrypto only.
// Works as a browser ES module and can be imported from Node for testing
// (the UI wiring below never runs when there is no document/window).

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Decode a base32 string (RFC 4648) into bytes.
 * Accepts uppercase A-Z and 2-7, ignores spaces, tolerates trailing '='
 * padding, and throws an Error on any other character.
 * @param {string} str
 * @returns {Uint8Array}
 */
export function base32Decode(str) {
  const clean = String(str).replace(/\s+/g, "").replace(/=+$/g, "");
  let bits = 0;
  let bitCount = 0;
  const out = [];
  for (const ch of clean) {
    const value = B32_ALPHABET.indexOf(ch);
    if (value === -1) {
      throw new Error(`Invalid base32 character: "${ch}"`);
    }
    bits = (bits << 5) | value;
    bitCount += 5;
    if (bitCount >= 8) {
      bitCount -= 8;
      out.push((bits >>> bitCount) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/**
 * One-time password from a counter (RFC 4226, 5.3).
 * HMAC-SHA1 over an 8-byte big-endian counter, dynamic truncation,
 * truncated to `digits` and zero padded.
 * @param {Uint8Array} secretBytes
 * @param {number|bigint} counter
 * @param {number} [digits=6]
 * @returns {Promise<string>}
 */
export async function hotp(secretBytes, counter, digits = 6) {
  if (!Number.isInteger(digits) || digits < 1 || digits > 10) {
    throw new Error("digits must be an integer between 1 and 10");
  }
  const msg = new Uint8Array(8);
  let c = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    msg[i] = Number(c & 0xffn);
    c >>= 8n;
  }
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const mac = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const truncated =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(truncated % 10 ** digits).padStart(digits, "0");
}

/**
 * Time-based one-time password (RFC 6238).
 * @param {Uint8Array} secretBytes
 * @param {number} unixSeconds
 * @param {number} [digits=6]
 * @param {number} [period=30]
 * @returns {Promise<string>}
 */
export async function totp(secretBytes, unixSeconds, digits = 6, period = 30) {
  return hotp(secretBytes, Math.floor(unixSeconds / period), digits);
}

// ---------------------------------------------------------------------------
// Browser UI wiring. Guarded so importing this module in Node is a no-op
// beyond the exported functions above.
// ---------------------------------------------------------------------------

if (typeof document !== "undefined") {
  const init = () => {
    const secretInput = document.getElementById("secret");
    const digitsSelect = document.getElementById("digits");
    const periodSelect = document.getElementById("period");
    const codeEl = document.getElementById("code");
    const countdownEl = document.getElementById("countdown");
    const barEl = document.getElementById("bar");
    const barFillEl = document.getElementById("bar-fill");
    const copyBtn = document.getElementById("copy");
    const runBtn = document.getElementById("run-vectors");
    const vectorResults = document.getElementById("vector-results");

    // The RFC-published test secret: ASCII "12345678901234567890" in base32.
    const vectorSecret = base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    const HOTP_EXPECTED = [
      "755224", "287082", "359152", "969429", "338314",
      "254676", "287922", "162583", "399871", "520489",
    ];
    const TOTP_EXPECTED = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ];

    let currentCode = "";
    let currentCounter = -1;
    let currentPeriod = 30;
    let copyTimer = 0;

    const readSettings = () => {
      const raw = secretInput.value.trim();
      if (raw === "") {
        throw new Error("Empty secret");
      }
      const secret = base32Decode(raw.toUpperCase());
      const digits = Number(digitsSelect.value);
      const period = Number(periodSelect.value);
      return { secret, digits, period };
    };

    // Split the code for readability: "123 456" (6 digits), "1234 5678" (8).
    const splitCode = (code) => {
      if (code.length < 6) return code;
      const half = Math.ceil(code.length / 2);
      return code.slice(0, half) + " " + code.slice(half);
    };

    const restartDrain = (periodSeconds, remainingSeconds) => {
      barEl.style.setProperty("--bar-period", `${periodSeconds}s`);
      // Start the CSS drain from the fraction of the period that is left.
      barFillEl.style.animationDelay = `-${periodSeconds - remainingSeconds}s`;
      barFillEl.classList.remove("draining");
      void barFillEl.offsetWidth; // force reflow so the animation restarts
      barFillEl.classList.add("draining");
    };

    const renderCode = (code) => {
      currentCode = code;
      codeEl.textContent = splitCode(code);
    };

    const refresh = async () => {
      let settings;
      try {
        settings = readSettings();
      } catch {
        // Keep showing the last valid code; mark the field as invalid.
        secretInput.classList.add("invalid");
        return;
      }
      secretInput.classList.remove("invalid");
      const { secret, digits, period } = settings;
      currentPeriod = period;
      const now = Math.floor(Date.now() / 1000);
      currentCounter = Math.floor(now / period);
      const code = await totp(secret, now, digits, period);
      renderCode(code);
      restartDrain(period, period - (now % period));
      tick();
    };

    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = currentPeriod - (now % currentPeriod);
      countdownEl.textContent = `${remaining} s`;
      if (Math.floor(now / currentPeriod) !== currentCounter) {
        refresh();
      }
    };

    const onSettingChange = () => {
      refresh();
    };

    // Copy with a clipboard API first, textarea + execCommand fallback.
    const copyCode = async () => {
      if (!currentCode) return;
      let ok = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(currentCode);
          ok = true;
        } else {
          const ta = document.createElement("textarea");
          ta.value = currentCode;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          ok = document.execCommand("copy");
          ta.remove();
        }
      } catch {
        ok = false;
      }
      const label = ok ? "Copied" : "Copy failed";
      copyBtn.textContent = label;
      copyBtn.classList.toggle("done", ok);
      clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => {
        copyBtn.textContent = "Copy";
        copyBtn.classList.remove("done");
      }, 1500);
    };

    const cell = (value, extraClass = "") => {
      const td = document.createElement("td");
      td.textContent = value;
      if (extraClass) td.classList.add(extraClass);
      return td;
    };

    const runVectors = async () => {
      runBtn.disabled = true;
      runBtn.textContent = "Running…";
      vectorResults.textContent = "";

      const table = document.createElement("table");
      table.className = "vectors";
      const head = table.createTHead();
      const headRow = head.insertRow();
      for (const col of ["Test", "Expected", "Got", "Pass"]) {
        const th = document.createElement("th");
        th.textContent = col;
        headRow.appendChild(th);
      }
      const body = table.createTBody();
      let passed = 0;
      const total = HOTP_EXPECTED.length + TOTP_EXPECTED.length;

      const addRow = (test, expected, got) => {
        const ok = got === expected;
        if (ok) passed += 1;
        const row = body.insertRow();
        row.appendChild(cell(test));
        row.appendChild(cell(expected));
        row.appendChild(cell(got, ok ? "" : "fail"));
        row.appendChild(cell(ok ? "yes" : "no", ok ? "" : "fail"));
      };

      for (let i = 0; i < HOTP_EXPECTED.length; i++) {
        const got = await hotp(vectorSecret, i, 6);
        addRow(`HOTP counter=${i}`, HOTP_EXPECTED[i], got);
      }
      for (const [t, expected] of TOTP_EXPECTED) {
        const got = await totp(vectorSecret, t, 8, 30);
        addRow(`TOTP t=${t} (30 s period)`, expected, got);
      }

      vectorResults.appendChild(table);
      const summary = document.createElement("p");
      summary.className = "vectors-summary";
      summary.textContent = `${passed}/${total} passed`;
      vectorResults.appendChild(summary);

      runBtn.disabled = false;
      runBtn.textContent = "Run vectors";
    };

    secretInput.addEventListener("input", onSettingChange);
    digitsSelect.addEventListener("change", onSettingChange);
    periodSelect.addEventListener("change", onSettingChange);
    copyBtn.addEventListener("click", copyCode);
    runBtn.addEventListener("click", runVectors);

    window.setInterval(tick, 250);
    refresh();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
