# Follower Lens

Privacy-first follower relationship analyzer built with React + TypeScript.

Follower Lens compares Instagram/Meta data-export JSON files locally in your browser and shows:

- Accounts you follow that do not follow you back
- Mutual follows
- Accounts that follow you but you do not follow back
- Search + TXT export

## Privacy

The MVP requests **zero extension permissions**.

- No Instagram password
- No remote server
- No analytics
- No account automation
- Export files are parsed locally in the browser

## Tech

- React 19
- TypeScript
- Vite
- Chrome Extension Manifest V3
- Pure CSS design system

## Run locally

```bash
npm install
npm run dev
```

For normal browser development, open the Vite URL shown in the terminal.

## Build extension

```bash
npm run build
```

Then:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the generated `dist` folder
5. Open Follower Lens from the extensions menu

## Data files

Download your Instagram/Meta account information as JSON and select the follower and following relationship files.

The parser supports the common export shape using `string_list_data` and also tolerates simple username/value structures.

## Roadmap

- [x] Local JSON parsing
- [x] Relationship comparison
- [x] Search
- [x] TXT export
- [x] Zero-permission Manifest V3 MVP
- [ ] CSV export
- [ ] Whitelist / hidden accounts
- [ ] Analysis history (local only)
- [ ] Theme switcher
- [ ] Tests
- [ ] Firefox packaging
- [ ] Experimental Live Mode

## Disclaimer

Follower Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Instagram or Meta.

Instagram is a trademark of Meta Platforms, Inc.
