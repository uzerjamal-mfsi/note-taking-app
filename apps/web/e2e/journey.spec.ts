import { expect, test, type Page } from "@playwright/test";
import { createTagViaApi, getOtp, uniqueUser } from "./fixtures.js";

const NOTE_TITLE = "Quarterly zebra plan";
const DRAFT_BODY = "first draft alpha";
const EDITED_TITLE = "Quarterly zebra plan v2";
const EDITED_BODY = "second draft beta";
const TAG_NAME = "E2E Work";

/**
 * Runs `action`, waits for the autosave PATCH it triggers to complete, and then requires the
 * editor's "Saved" status. The response wait stops a stale "Saved" from an earlier save passing
 * early; the anchored text stops "Unsaved changes" from matching.
 */
async function expectAutosaved(page: Page, action: () => Promise<void>): Promise<void> {
  const patched = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      /\/notes\/[^/]+$/.test(new URL(response.url()).pathname) &&
      response.ok(),
  );
  await action();
  await patched;
  await expect(page.getByText(/^Saved$/)).toBeVisible();
}

async function typeIntoBody(page: Page, text: string): Promise<void> {
  const body = page.locator(".ProseMirror");
  await body.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(text);
}

test("a user's full journey: notes, search, sharing, history, delete and password reset", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const user = uniqueUser();
  let shareUrl = "";

  await test.step("registration rejects invalid input", async () => {
    await page.goto("/register");
    await page.getByLabel("Name").fill(user.name);
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText(/invalid email/i)).toBeVisible();
    await expect(page.getByText(/at least 8/i)).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  await test.step("a visitor registers and lands on an empty notes list", async () => {
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByRole("button", { name: "New note" })).toBeVisible();
    await expect(page).not.toHaveURL(/\/(register|login)/);
  });

  await test.step("a tag created outside the UI shows up after the session is restored", async () => {
    await createTagViaApi(request, user, TAG_NAME);
    // The app already cached an empty tag list; a reload also proves the refresh cookie restores
    // the session across the web and API origins.
    await page.reload();
    await expect(page.getByRole("button", { name: "New note" })).toBeVisible();
  });

  await test.step("the user creates a note and the editor autosaves it", async () => {
    await page.getByRole("button", { name: "New note" }).click();
    await expect(page).toHaveURL(/\/notes\/[^/]+$/);

    await expectAutosaved(page, async () => {
      await page.getByLabel("Title").fill(NOTE_TITLE);
      await typeIntoBody(page, DRAFT_BODY);
    });
  });

  await test.step("the user tags the note", async () => {
    const tagButton = page.getByRole("list", { name: "Tags" }).getByRole("button", {
      name: TAG_NAME,
    });
    await expectAutosaved(page, async () => {
      await tagButton.click();
    });
    await expect(tagButton).toHaveAttribute("aria-pressed", "true");
  });

  await test.step("search finds the note and highlights the match", async () => {
    await page.goto("/");
    await page.getByLabel("Search notes").fill("zebra");

    await expect(page).toHaveURL(/[?&]q=zebra/);
    await expect(page.locator("mark", { hasText: /zebra/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(NOTE_TITLE) })).toBeVisible();
  });

  await test.step("the tag filter narrows the list to the tagged note", async () => {
    await page.getByRole("button", { name: "Clear search" }).click();
    await page
      .getByRole("list", { name: "Filter by tag" })
      .getByRole("button", {
        name: TAG_NAME,
      })
      .click();

    await expect(page.getByRole("link", { name: new RegExp(NOTE_TITLE) })).toBeVisible();
  });

  await test.step("the user shares the note and an anonymous visitor can read it", async () => {
    await page.getByRole("link", { name: new RegExp(NOTE_TITLE) }).click();
    await expect(page).toHaveURL(/\/notes\/[^/]+$/);
    await expect(page.getByLabel("Title")).toHaveValue(NOTE_TITLE);

    await page.getByRole("button", { name: "Share" }).click();
    const dialog = page.getByRole("dialog", { name: "Share this note" });
    await dialog.getByRole("button", { name: "Create link" }).click();
    shareUrl = await dialog.getByLabel("Public link").inputValue();
    expect(shareUrl).toMatch(/\/shared\/[^/]+$/);
    await page.keyboard.press("Escape");

    const anonymous = await browser.newContext();
    try {
      const anonymousPage = await anonymous.newPage();
      await anonymousPage.goto(shareUrl);

      await expect(anonymousPage.getByRole("heading", { name: NOTE_TITLE })).toBeVisible();
      await expect(anonymousPage.locator("article .ProseMirror")).toContainText(DRAFT_BODY);
      await expect(anonymousPage.getByRole("button", { name: "Log out" })).toHaveCount(0);
    } finally {
      await anonymous.close();
    }
  });

  await test.step("revoking the link makes it unavailable to anonymous visitors", async () => {
    await page.getByRole("button", { name: "Share" }).click();
    const dialog = page.getByRole("dialog", { name: "Share this note" });
    await dialog.getByRole("button", { name: "Revoke link" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
    await expect(dialog.getByRole("button", { name: "Create link" })).toBeVisible();
    await page.keyboard.press("Escape");

    const anonymous = await browser.newContext();
    try {
      const anonymousPage = await anonymous.newPage();
      await anonymousPage.goto(shareUrl);

      await expect(
        anonymousPage.getByRole("heading", { name: "This link has expired or been revoked" }),
      ).toBeVisible();
    } finally {
      await anonymous.close();
    }
  });

  await test.step("the user restores an earlier version from history", async () => {
    await expectAutosaved(page, async () => {
      await page.getByLabel("Title").fill(EDITED_TITLE);
      await typeIntoBody(page, EDITED_BODY);
    });

    await page.getByRole("button", { name: "History" }).click();
    const drawer = page.getByRole("dialog", { name: "Version history" });
    await drawer
      .getByRole("button", { name: new RegExp(`^${NOTE_TITLE}(?! v2)`) })
      .first()
      .click();

    await expect(drawer.getByRole("heading", { name: NOTE_TITLE, level: 3 })).toBeVisible();
    await expect(drawer.locator(".ProseMirror")).toContainText(DRAFT_BODY);

    await drawer.getByRole("button", { name: "Restore" }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByLabel("Title")).toHaveValue(NOTE_TITLE);
    await expect(page.locator(".ProseMirror")).toContainText(DRAFT_BODY);
  });

  await test.step("deleting the note removes it from the list", async () => {
    await page.getByRole("button", { name: "Delete note" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: new RegExp(NOTE_TITLE) })).toHaveCount(0);
  });

  await test.step("logging out blocks protected pages", async () => {
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "New note" })).toHaveCount(0);
  });

  await test.step("the user resets a forgotten password with the logged OTP", async () => {
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await page.getByLabel("Email").fill(user.email);
    await page.getByRole("button", { name: "Send reset code" }).click();
    await page.getByRole("link", { name: "Enter code" }).click();

    const otp = await getOtp(user.email);
    await page.getByLabel("Code").fill(otp);
    await page.getByLabel("New password").fill(user.newPassword);
    await page.getByRole("button", { name: "Reset password" }).click();

    await expect(page).toHaveURL(/\/login$/);
  });

  await test.step("the old password is rejected and the new one logs in", async () => {
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Password").fill(user.newPassword);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("button", { name: "New note" })).toBeVisible();
  });
});
