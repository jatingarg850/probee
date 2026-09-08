# Pre-launch testing checklist

Manual walkthroughs to run before sending real traffic to production. Use two
browser profiles (or one normal + one incognito window) so you can hold a
recruiter session and a candidate session open at the same time — several
items below depend on doing something as one and checking the effect as the
other.

Check off each box as you go. Anything that fails, note the exact steps to
reproduce it before moving on.

---

## 0. Environment sanity (do this first)

- [ ] `server/.env` has real values for `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `GEMINI_API_KEY`, `MURF_API_KEY`, `CORS_ALLOWED_ORIGINS` (see `server/.env.example`)
- [ ] `web/.env` has real values for `MONGODB_URI`, `JWT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (rotated if you're reading this after the leaked-secret fix), `RESEND_API_KEY`, `STORAGE_*`
- [ ] `GET /health` on the Python backend returns `{"status":"ok","agentConfigured":true,"geminiConfigured":true}` — if `agentConfigured` or `geminiConfigured` is `false`, stop and fix credentials before testing anything else
- [ ] `GET /api/health` on the Next.js app returns `{"status":"ok"}`
- [ ] `cd web && bun run verify` passes (doctor + API contract checks + production build)
- [ ] Storage is actually working: run `bun run scripts/test-storage.ts` (or equivalent) and confirm upload/read/delete all succeed — if this fails, recordings will silently not save (see §4 below)

---

## 1. Recruiter — account & organization

- [ ] Register a new account with email + password
- [ ] Register fails cleanly with a real, non-generic error message when the email is already taken
- [ ] Sign in with Google OAuth works end to end (redirect, consent screen, lands back signed in)
- [ ] Sign out actually clears the session (reload lands you back on `/login`)
- [ ] Create a new organization
- [ ] Invite a teammate to the org (check the email actually arrives, or the copyable link works if email isn't configured)
- [ ] Accept that team invite in a separate/incognito session as a new user
- [ ] Change a teammate's role (e.g. viewer → recruiter) and confirm their available actions change accordingly
- [ ] Remove a teammate and confirm they lose access
- [ ] Org settings: update org name / retention days, confirm it saves
- [ ] **Delete organization** (danger zone): confirm it requires typing the exact org name, and afterward confirm compliance records (consents, decisions, demographics) are *not* deleted (check directly in the DB if you have access) while the org and its jobs are gone

## 2. Recruiter — job creation & editing

- [ ] Create a new job with all fields filled in (title, level, description, competencies summing to 100, panel seats, duration, must-ask questions)
- [ ] Click "Create job" and confirm the button does **not** get stuck on "Saving…" — it should either navigate you to the job's page or flip back to a normal state within a second or two
- [ ] **Upload a job description**: use the "Upload PDF or text" control with a real PDF job posting — confirm the extracted text lands in the description field and reads sensibly (not garbled, not empty)
- [ ] Try uploading a non-PDF/non-text file (e.g. a `.docx` or image) and confirm it's rejected with a clear message, not a crash
- [ ] Try uploading a PDF that isn't actually a job description (e.g. a random document) — confirm you get a clear "couldn't find a job description" message rather than nonsense text
- [ ] Edit an existing job (change title, competencies, duration) and save — confirm the "Save changes" button returns to normal (not stuck saying "Saving…") and shows a brief "Saved" confirmation
- [ ] Try to save a job whose competency weights don't add up to 100 — confirm it's blocked client-side with a clear message
- [ ] Try to save with zero panel seats selected — confirm it's blocked
- [ ] Set a job to `draft`, confirm the candidates panel says you can't invite yet
- [ ] Set the job to `open`, confirm inviting becomes available
- [ ] Set an open job back to `closed`, confirm existing candidate links for it stop working (see §3)

## 3. Recruiter — inviting candidates

- [ ] Invite one candidate by typing a single email into the box
- [ ] Invite one candidate as `Name <email>` and confirm the name is picked up correctly
- [ ] Paste a multi-line list (mix of `email`, `email, name`, `Name <email>` formats) and confirm all valid rows are invited and any bad rows are reported individually, not silently dropped
- [ ] **Set "Link expires in" to something other than the default** (e.g. 3 days) before sending, then check the invited row shows the correct expiry date
- [ ] **Upload a CSV** with `email` and `name` columns — confirm the preview shows the right row count before you hit send, and that the actual invites match
- [ ] **Upload an Excel (`.xlsx`) file** with the same shape — confirm it parses identically to the CSV
- [ ] Upload a CSV with a missing `email` column — confirm you get a clear error instead of it silently inviting nobody
- [ ] Upload a CSV with a malformed email in one row — confirm that row is reported and the rest still go through
- [ ] Re-invite the same candidate a second time — confirm it says "reissued" rather than creating a duplicate interview, and the earlier link stops working
- [ ] Cancel/revoke a pending invitation — confirm that candidate's link no longer opens an interview
- [ ] Try to invite while the job is `draft` or `closed` — confirm the form is disabled with an explanation
- [ ] Copy an invite link from the "sent" list and confirm it matches what actually went out in the email (if email is configured, check the real inbox too)

## 4. Candidate — the interview itself

Open each invite link in a private/incognito window (candidates have no account).

- [ ] Open a valid link — confirm the consent/disclosure screen shows the right organization name, role, and duration
- [ ] Decline consent — confirm you're told your decline is recorded and the interview does not start
- [ ] Re-open the same link after declining — confirm you can still say yes on a second visit
- [ ] Accept consent, optionally answer the demographic questions, and confirm you land on the camera/mic precheck
- [ ] Deny camera/microphone permission at the precheck — confirm a clear, actionable message (not a silent hang)
- [ ] Grant permissions and start the interview — confirm the panel introduces itself, asks a first question, and the video/audio both work in both directions
- [ ] Answer at least one question per panelist so a handoff occurs — confirm the transition between interviewers is smooth (new voice, no dead air, no repeated question)
- [ ] **Check the live transcript panel does not duplicate lines** as you and the panel speak — each utterance should appear once, not multiple growing copies (this was a real bug that was fixed — re-verify it stayed fixed)
- [ ] Confirm any "must-ask" questions configured on the job actually get asked during the interview
- [ ] Deliberately look away from the camera for 6+ seconds — confirm a proctoring warning appears (the threshold is ~5s by design, so a brief glance away should *not* trigger one — only a sustained one)
- [ ] Cover the camera / step out of frame for 5+ seconds — confirm a "no face detected" warning appears
- [ ] Have a second person step into frame — confirm a "multiple faces" warning appears
- [ ] Switch away from the browser tab — confirm it's flagged as a tab-switch violation
- [ ] Accumulate enough violations to hit the strike limit — confirm the interview actually terminates rather than continuing indefinitely
- [ ] Let an interview run to completion normally (no violations) — confirm it ends cleanly with a "you're done" screen, not stuck loading
- [ ] Reload the page mid-interview (simulating a crash/refresh) — confirm you can resume rather than being permanently locked out
- [ ] Try to reopen the link after the interview is completed — confirm it says the interview is already done and does not let you sit it again
- [ ] Try opening an expired link (or one you've set a very short expiry on for testing) — confirm a clear "expired" message, not a crash

## 5. Recruiter — reviewing results

- [ ] After a candidate completes their interview, confirm it appears on the org's Candidates page within a minute or so
- [ ] Open that candidate's detail page — confirm the transcript reads correctly and matches what was actually said (spot-check against your own test run)
- [ ] Confirm the assessment shows scores broken down by *this job's* competencies (not the generic 5 practice-mode competencies) if the job used custom ones
- [ ] Confirm the Evidence Quality section shows both "fully backed" and "probed" percentages, and that they make sense relative to how thorough your test answers were
- [ ] Confirm integrity flags/violations from your test run show up in the timeline with roughly correct timestamps
- [ ] A candidate who was terminated early (from §4's strike test) should visibly read as "Ended early" in both the list and detail view, distinct from a normal completion
- [ ] **Recording playback**: on a candidate who completed with camera/mic on, click "Load recording" and confirm the video/audio actually plays back and roughly matches the real interview (skip this if storage isn't configured yet — see §0)
- [ ] A candidate who denied camera/mic (or whose upload failed) should show a clear "no recording was saved" message, not an error
- [ ] **Export CSV** from the Candidates page — open the file in Excel/Sheets and confirm the columns, scores, and dates are correct and not garbled (check a candidate with a non-ASCII name if you have one, to confirm encoding is right)
- [ ] Record a hiring decision (advance/reject/review) on a candidate if that feature is in scope for this release, and confirm it's saved and visible to other org members

## 6. Cross-cutting checks

- [ ] Run through the candidate flow (§4) on an actual mobile phone, not just a resized desktop browser — camera/mic permission prompts and layout often behave differently
- [ ] Run through the recruiter flow (§1–3, 5) at a narrow desktop width and confirm nothing overlaps or gets clipped
- [ ] Toggle your OS/browser between light and dark mode and re-check both flows for any illegible text or invisible controls
- [ ] Confirm there is no spinning circular loader anywhere in either flow — loading states should be skeletons or the dot-based inline indicator
- [ ] Open browser dev tools and watch the Network/Console tabs during both flows — no unhandled JS errors, no requests failing silently
- [ ] Hit `/api/auth/login` with the wrong password ~12 times in under 5 minutes — confirm you eventually get a `429 Too Many Requests` rather than unlimited attempts
- [ ] Confirm a plain `curl`/Postman request to a data route (e.g. `/api/orgs`) with no auth header is rejected with 401, not a 500 or a data leak
- [ ] Confirm error messages shown anywhere in the UI never include a raw stack trace, file path, or database error string

---

## What to do when something fails

Note the exact URL, the exact steps, and — if it's a backend error — check the
PM2 logs (`pm2 logs knotic-backend` / `pm2 logs knotic-frontend`) for the real
error before reporting it, since the client-facing message is deliberately
generic and won't contain the diagnostic detail.
