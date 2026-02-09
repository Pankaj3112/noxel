import { describe, it, expect } from "vitest";
import { generateSubdomain, isValidSubdomain } from "./subdomain.js";

describe("subdomain", () => {
  it("generates subdomain in format app-xxx", () => {
    const sub = generateSubdomain("uptime-kuma");
    expect(sub).toMatch(/^uptime-kuma-[a-z0-9]{3}$/);
  });

  it("sanitizes app name", () => {
    const sub = generateSubdomain("My App 2.0");
    expect(sub).toMatch(/^my-app-20-[a-z0-9]{3}$/);
  });

  it("generates different subdomains each time", () => {
    const subs = new Set(Array.from({ length: 20 }, () => generateSubdomain("app")));
    expect(subs.size).toBeGreaterThan(1);
  });

  it("validates subdomain format", () => {
    expect(isValidSubdomain("uptime-kuma-a7x")).toBe(true);
    expect(isValidSubdomain("n8n-b2k")).toBe(true);
    expect(isValidSubdomain("")).toBe(false);
    expect(isValidSubdomain("UPPERCASE")).toBe(false);
    expect(isValidSubdomain("has spaces")).toBe(false);
    expect(isValidSubdomain("-leading-dash")).toBe(false);
  });
});
