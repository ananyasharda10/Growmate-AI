import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// These five checks correspond one-to-one to the "Regression watch" list from the Sept 2026
// QA report: behaviors that were confirmed fixed, then silently broke again in a later build.
// Each test targets that specific regression class, not general feature coverage.

async function startDemo(page: Page) {
  await page.goto("/auth");
  await page.getByRole("button", { name: /try demo/i }).click();
  await expect(page).toHaveURL("/");
  // A fresh session always opens the welcome tour modal, which otherwise blocks every other
  // click on the page.
  await page.getByRole("button", { name: "Skip tour" }).click();
}

// Demo mode's session lives only in memory (Zustand), not localStorage — a real page.goto()
// or reload() is a full browser navigation that wipes it, exactly like closing the tab would.
// Moving between pages while keeping the demo session alive means clicking the in-app nav,
// the same way a real user would, rather than page.goto().
async function goToNav(page: Page, label: string) {
  await page.getByRole("link", { name: label }).click();
}

test("1. a due payment creates a row in Recent transactions", async ({ page }) => {
  await startDemo(page);
  await goToNav(page, "Dues");

  const firstPending = page.locator("ul > li").filter({ hasText: "Pay" }).first();
  const name = await firstPending.locator("p.font-semibold").first().innerText();

  await firstPending.getByRole("button", { name: "Pay", exact: true }).click();
  await page.getByRole("button", { name: "Record payment" }).click();

  await goToNav(page, "Money In / Out");
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
});

test("2. inner routes resolve on direct navigation and refresh (no 404)", async ({ page }) => {
  // Guards the server-side rewrite this depends on — Vite/`vercel dev` fall back to
  // index.html for unknown paths regardless of this file, so a browser-only check here would
  // stay green even if this config were deleted and production started 404ing.
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(here, "..", "vercel.json"), "utf-8"));
  expect(vercelConfig.rewrites).toContainEqual({ source: "/(.*)", destination: "/index.html" });

  // Each of these is a fresh, real navigation (not an SPA route change) — exactly what
  // "direct load or refresh" means, and exactly what would 404 if the rewrite broke.
  for (const route of ["/money", "/dashboard", "/inventory", "/dues", "/analytics", "/advisor", "/settings"]) {
    await page.goto(route);
    await expect(page.locator("body")).not.toContainText(/404|NOT_FOUND/i);
    await page.reload();
    await expect(page.locator("body")).not.toContainText(/404|NOT_FOUND/i);
  }
});

test("3. resetting demo data preserves the currently selected currency", async ({ page }) => {
  await startDemo(page);
  await goToNav(page, "Settings");

  // The Currency <select> isn't wired to its <label> via htmlFor/id, so it's located
  // relative to the "Currency" label text instead of getByLabel.
  const currencySelect = page.locator("label", { hasText: "Currency" }).locator("xpath=following-sibling::select");
  await currencySelect.selectOption("USD");
  await expect(currencySelect).toHaveValue("USD");

  await page.getByRole("button", { name: "Load / reset demo data" }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();

  // The <select>'s own local React state would still read "USD" here even if the reset had
  // silently reverted the store back to INR underneath it (it's never resynced from the
  // store after mount) — so the real assertion is against a value rendered from the global
  // store elsewhere on the page, not the control the user just touched.
  await goToNav(page, "Dashboard");
  await expect(page.getByText("$", { exact: false }).first()).toBeVisible();
});

test("4. the auth-page Hindi tagline renders real Devanagari text", async ({ page }) => {
  await page.goto("/auth");
  await page.getByRole("button", { name: "हिं" }).click();

  const tagline = page.locator("p.font-medium.text-brand-600");
  await expect(tagline).toBeVisible();
  const text = await tagline.innerText();
  // Devanagari Unicode block is U+0900-U+097F — a regression that silently falls back to
  // English (or shows mojibake) would fail this even though the element itself renders fine.
  expect(text).toMatch(/[ऀ-ॿ]/);
});

test("5. advisor chat history survives navigating away and back", async ({ page }) => {
  await startDemo(page);
  await goToNav(page, "AI Advisor");

  const question = "What is my current cash on hand?";
  await page.getByPlaceholder(/ask grow/i).fill(question);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText(question)).toBeVisible();

  await goToNav(page, "Dashboard");
  await goToNav(page, "AI Advisor");
  await expect(page.getByText(question)).toBeVisible();
});
