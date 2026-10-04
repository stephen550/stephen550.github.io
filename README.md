# Advantage HPE dashboard (static host)

This repo only hosts the static web app. It contains no business data: the page loads data from Supabase after an allow-listed user signs in.

- `release.txt` points at the current bundle (URL + sha256). Changing it runs `.github/workflows/sync.yml`, which verifies the sha256 and commits the files.
- Commits made by the workflow do not trigger a Pages build, so a follow-up commit to `deploy.txt` publishes the site.
