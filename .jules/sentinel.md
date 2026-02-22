## 2026-02-22 - [Information Disclosure via Firebase Hosting]
**Vulnerability:** Default Firebase Hosting configuration often serves all files in the public directory, including sensitive files like `.git/config`, `package.json`, and source code if not properly ignored.
**Learning:** Setting `"public": "."` is particularly dangerous as it exposes the entire repository. Even if specific files are ignored by `.gitignore`, they must also be explicitly ignored in `firebase.json` to prevent them from being deployed and served.
**Prevention:** Always maintain a strict `ignore` list in `firebase.json`. Better yet, use a dedicated `public` or `dist` folder that only contains build artifacts and static assets.
