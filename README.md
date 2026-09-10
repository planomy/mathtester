# TestPro

Handwritten tests with authentic student working — stylus, mouse, or finger. Teachers can lock images or PDF pages under the canvas so students write over graphs and sources.

**Live app:** https://planomy.github.io/mathtester/

(Product name: **TestPro**. Repo folder remains `mathtester` for the GitHub Pages path.)

## Flow

1. **Teacher** sets name, email, and a 4-digit PIN on this device.
2. Create a test with one question per slide; optionally attach a locked image/PDF and disable the typing tool.
3. **Publish** to get a student link (data travels in the link — no server required for joining).
4. **Student** joins, works on a paper-like canvas, submits → full-test **PDF** (+ JSON) downloads and a `mailto:` draft opens to the teacher email.
5. Teacher **imports** a token or JSON under Submissions, marks in-app, and downloads a marked PDF.
6. Use **Save backup** so tests and submissions survive browser clears or a new device.

## Develop

```bash
npm install
npm run dev
```

## Deploy (GitHub Pages)

Built into `/docs` from `main`.

```bash
npm run build
git add docs/
git commit -m "Update GitHub Pages build"
git push origin main
```

Repo settings: **Pages → Deploy from a branch → `main` / `/docs`**.

## Auth choice (v1)

- Teacher: local profile + PIN (classroom-simple, no account server).
- Student: name + join link/code (no login).
- Cross-device tests: share the **full published link** (or QR it). Short codes alone only resolve on the teacher device’s browser storage.
