# Icon Mayhem builder

Builds [Icon Mayhem](https://github.com/ZhulinskiiDanil/icon-mayhem), a Geode mod for Geometry Dash, for **Windows and Android** on every push, on Railway: faster than GitHub Actions thanks to caches that stay between builds. macOS and iOS are built by GitHub Actions for releases.

- Windows is cross-compiled on Linux with clang-cl and the Windows SDK (`geode sdk install-linux`), Android with the NDK r29. The three builds are merged into one `.geode` with `geode package merge`.
- The volume keeps the NDK, the Geode SDK (at the version in the mod's `mod.json`), the Windows SDK, the CPM source cache, ccache and a build folder per platform: after the first build only what changed is rebuilt.
- Every build shows on its commit on GitHub (`railway/build`), linking to its page.

## Deploy on Railway

1. New Project → Deploy from GitHub repo → this repo (it builds from the `Dockerfile`).
2. **Volume** mounted at `/data`, 10 GB.
3. **Variables**:
   - `GITHUB_TOKEN`: a fine-grained token for the mod's repo with *Contents: read* and *Commit statuses: read and write*
   - `WEBHOOK_SECRET`: the secret of the GitHub webhook
   - `BUILD_KEY`: a long random string, for builds on demand
   - `REPO`: `ZhulinskiiDanil/icon-mayhem`
4. Settings → Networking → **Generate Domain**.
5. In the mod's repo: Settings → Webhooks → `https://<domain>/webhook`, content type `application/json`, the same secret, just the push event.

More vCPUs make builds faster: the compiler uses them all.

## Pages

| | |
|---|---|
| `GET /` | the last builds |
| `GET /builds/:sha` | a build: status, files, the end of its log (`Accept: application/json` for JSON) |
| `GET /builds/:sha/log` | the whole log |
| `GET /builds/:sha/zhulis.icon-mayhem.geode` | the mod for Windows and Android |
| `GET /builds/:sha/win.geode`, `android64.geode`, `android32.geode` | each platform alone |
| `POST /webhook` | GitHub pushes |
| `POST /build` | `{ "ref": "main" }` with `X-Build-Key`: builds a branch, tag or commit on demand |
| `GET /health` | `{ ok: true }` |

## Locally

```sh
npm install
npm run dry   # the webhook, the queue and the pages, with a fake build
```

## License

MIT
