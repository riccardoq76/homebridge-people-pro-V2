# Release process (personal notes)

Steps to actually ship a change, in order. Written down because there's no memory across
sessions - if you're picking this back up later (with or without an AI assistant), this is the
checklist.

## 1. Before releasing

- Run `npm test` and `node -c` on every changed file - both should pass clean.
- Add a new entry at the top of `CHANGELOG.md` describing what changed.
- Commit everything except the version bump itself (code changes, changelog entry, docs).

## 2. Bump the version and tag it

```
npm version patch   # or: minor / major, depending on the change
```

This does three things at once: updates `"version"` in `package.json`, creates a git commit for
that change, and creates a matching git tag. It requires a clean working tree (no uncommitted
changes) - that's why step 1 commits everything else first.

## 3. Push to GitHub

```
git push
git push --tags
```

`npm version` does NOT push automatically - both of these are needed, the tag push separately
from the commit push.

## 4. Publish to npm

```
npm publish
```

(No `--access public` needed after the very first publish - only required the first time for a
scoped package.)

## 5. Update it on my own Raspberry Pi

I install directly from GitHub on my own Homebridge instance (not from npm), so I get the exact
commit I just tested rather than waiting on the npm publish step above. See the "Note for my own
Raspberry Pi setup" section in `README.md` for the exact command - short version:

```
npm install --prefix /var/lib/homebridge github:riccardoq76/homebridge-people-pro-V2
```

Then restart Homebridge (UI, or `sudo hb-service restart`), and check the logs for errors before
considering the release done.

## Quick reference: what each destination is for

- **GitHub** (`riccardoq76/homebridge-people-pro-V2`): source of truth, always has the latest
  commit, including changes not yet formally released.
- **npm** (`@riccardoq76/homebridge-people-pro`): what shows up in the Homebridge UI's plugin
  search and "update available" indicator. Only updates when you run `npm publish` - a GitHub
  push alone does nothing here.
