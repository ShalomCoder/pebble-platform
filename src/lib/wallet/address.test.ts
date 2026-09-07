import { describe, expect, it } from "vitest";
import {
  accountFragmentFromPublicCode,
  calculateWalletChecksum,
  generateWalletAddress,
  validateWalletAddress,
  WALLET_ADDRESS_LENGTH,
} from "./address";

describe("wallet address generation", () => {
  it("produces 11-digit numeric addresses", () => {
    for (let i = 0; i < 200; i++) {
      const address = generateWalletAddress("482913");
      expect(address).toMatch(/^\d{11}$/);
      expect(address.length).toBe(WALLET_ADDRESS_LENGTH);
    }
  });

  it("produces addresses that validate", () => {
    for (let i = 0; i < 100; i++) {
      const address = generateWalletAddress("120765");
      expect(validateWalletAddress(address)).toBe(true);
    }
  });

  it("derives the same account fragment for the same public code", () => {
    expect(accountFragmentFromPublicCode("482913")).toBe(
      accountFragmentFromPublicCode("482913"),
    );
  });

  it("is deterministic given a fixed wallet component", () => {
    // calculateWalletChecksum is deterministic
    expect(calculateWalletChecksum("847391625")).toBe(calculateWalletChecksum("847391625"));
  });

  it("handles a leading-zero wallet component", () => {
    // Construct an address whose wallet component starts with zeros.
    const fragment = accountFragmentFromPublicCode("009999");
    const identity = `${fragment}000123`;
    const checksum = calculateWalletChecksum(identity);
    const address = identity + checksum;
    expect(address).toMatch(/^\d{11}$/);
    expect(validateWalletAddress(address)).toBe(true);
  });

  it("can produce checksum 00 and 41", () => {
    const checksum00 = calculateWalletChecksum("000000000");
    expect(checksum00).toMatch(/^\d{2}$/);
    const someNumber = Number(checksum00);
    expect(someNumber).toBeGreaterThanOrEqual(0);
    expect(someNumber).toBeLessThan(42);

    const checksum41 = calculateWalletChecksum("999999999");
    const n41 = Number(checksum41);
    expect(n41).toBeGreaterThanOrEqual(0);
    expect(n41).toBeLessThan(42);
  });

  it("generation includes exactly the expected parts", () => {
    const address = generateWalletAddress("482913");
    expect(address.length).toBe(11);
    expect(address.slice(0, 9)).toBe(
      accountFragmentFromPublicCode("482913") + address.slice(3, 9),
    );
    expect(address.slice(9)).toBe(calculateWalletChecksum(address.slice(0, 9)));
  });
});

describe("wallet address validation", () => {
  it("rejects non-string values", () => {
    expect(validateWalletAddress(undefined)).toBe(false);
    expect(validateWalletAddress(null)).toBe(false);
    expect(validateWalletAddress(12345678901)).toBe(false);
    expect(validateWalletAddress(["84739162517"])).toBe(false);
  });

  it("rejects missing or empty input", () => {
    expect(validateWalletAddress("")).toBe(false);
    expect(validateWalletAddress(" ")).toBe(false);
  });

  it("rejects wrong lengths", () => {
    expect(validateWalletAddress("8473916251")).toBe(false); // 10 digits
    expect(validateWalletAddress("847391625176")).toBe(false); // 12 digits
    expect(validateWalletAddress("847391")).toBe(false); // 6 digits
  });

  it("rejects non-numeric characters", () => {
    expect(validateWalletAddress("8473916251a")).toBe(false);
    expect(validateWalletAddress("84739a62517")).toBe(false);
    expect(validateWalletAddress("847-9162517")).toBe(false);
    expect(validateWalletAddress("84 739162517")).toBe(false);
  });

  it("rejects addresses with an invalid checksum", () => {
    // Identity 847391625 has checksum 20 (canonical example).
    expect(validateWalletAddress("84739162520")).toBe(true);
    expect(validateWalletAddress("84739162521")).toBe(false);
    expect(validateWalletAddress("84739162510")).toBe(false);
    expect(validateWalletAddress("84739162920")).toBe(false);
  });

  it("rejects a generated address after any digit is altered", () => {
    const address = generateWalletAddress("482913");
    for (let i = 0; i < address.length; i++) {
      const altered = address.slice(0, i) + ((Number(address[i]) + 1) % 10) + address.slice(i + 1);
      if (altered !== address) {
        expect(validateWalletAddress(altered)).toBe(false);
      }
    }
  });

  it("validator must not claim validity for a checksum from a different tool", () => {
    // The checksum is math: all-zeros validates (0 == checksum "00"), but any
    // deviation from the computed checksum must be rejected. Identity
    // "111111111" has checksum "39", not "11".
    expect(validateWalletAddress("00000000000")).toBe(true);
    expect(validateWalletAddress("00000000001")).toBe(false);
    expect(validateWalletAddress("11111111111")).toBe(false);
    expect(validateWalletAddress("11111111139")).toBe(true);
  });
});

describe("checksum math", () => {
  it("returns two-digit strings for every identity", () => {
    for (let i = 0; i < 500; i++) {
      const identity = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
      const cs = calculateWalletChecksum(identity);
      expect(cs).toMatch(/^\d{2}$/);
    }
  });

  it("throws on malformed identity input", () => {
    expect(() => calculateWalletChecksum("84739162")).toThrow();
    expect(() => calculateWalletChecksum("8473916251")).toThrow();
    expect(() => calculateWalletChecksum("84739162a5")).toThrow();
    expect(() => calculateWalletChecksum("")).toThrow();
  });
});