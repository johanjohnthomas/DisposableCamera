# Ten Frames — RachBirthday2026

Public camera website for the event. Private photo storage and access controls run on Supabase. This repository contains only the frontend and its deployment tooling. The Supabase project URL and publishable key in web/config.js are intentionally public; never add secret/service-role keys or passwords.

## Deploy

In repository Settings → Pages, choose GitHub Actions as the source. Run the Deploy website workflow on main. Only web/ is published.

## Local preview

Run npm start, then open http://127.0.0.1:4173/?demo=1 for a device-local preview. The normal route connects to the event. Run npm run check:public and npm run check before pushing changes.
