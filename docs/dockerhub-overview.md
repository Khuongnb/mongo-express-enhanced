# mongo-express-enhanced

A UI / UX enhanced fork of [mongo-express](https://github.com/mongo-express/mongo-express), the web-based MongoDB admin interface.
It is a drop-in replacement: the same `ME_CONFIG_*` settings and the same features, with a redesigned interface and a much more capable
collection filter.

![A collection with a two-row filter applied](https://raw.githubusercontent.com/Khuongnb/mongo-express-enhanced/e-master/docs/screenshots/collection.png)

**Source and full documentation:** https://github.com/Khuongnb/mongo-express-enhanced

## What is different

- **Multi-row filter.** Comparison operators (`=` `≠` `>` `≥` `<` `≤`) per row, up to 10 rows, combined with **All** (AND) or **Any** (OR).
  Includes a Date type and **Copy as query**, which gives you the equivalent Advanced query to paste.
- **The Type follows the Key.** Type a field name and its type (Number, Date, ObjectId, UUID, String) is picked from the documents on the page.
- **Safe by design.** The table, count, exports and *Delete all matching* all use the same filter. A filter that cannot be read stops the
  action instead of being ignored, so a typo can never turn "delete matching" into "delete everything".
- **Shareable filters.** Filters live in the URL, so they can be bookmarked and sent to a colleague.
- **Redesigned interface.** Light and dark themes, a layout that works on a phone, typed cells, a column picker with saved presets,
  sorting from the column header, and click-a-row editing in a popup.
- **Rows per page.** Pick 10, 25, 50, 100 or 250 in the toolbar; the choice is remembered. 25 by default.
- **Friendlier behind a reverse proxy**, and a sign-in page that says when a password was wrong.

![The filter builder](https://raw.githubusercontent.com/Khuongnb/mongo-express-enhanced/e-master/docs/screenshots/filter.png)

## Quick start

```console
$ docker run -d --name mongo-express-enhanced -p 8081:8081 \
    -e ME_CONFIG_MONGODB_URL='mongodb://mongo:27017' \
    -e ME_CONFIG_BASICAUTH_ENABLED=true \
    -e ME_CONFIG_BASICAUTH_USERNAME=admin \
    -e ME_CONFIG_BASICAUTH_PASSWORD='change-me' \
    khuongnb/mongo-express-enhanced:e-v1.0.0-rc1
```

Then open http://localhost:8081. The container must be able to reach MongoDB at the URL you give it (for example, put both on the same
Docker network and use the MongoDB container's name as the host).

### Docker Compose

```yaml
services:
  mongo:
    image: mongo:7
  mongo-express:
    image: khuongnb/mongo-express-enhanced:e-v1.0.0-rc1
    ports:
      - "8081:8081"
    environment:
      ME_CONFIG_MONGODB_URL: mongodb://mongo:27017
      ME_CONFIG_BASICAUTH_ENABLED: "true"
      ME_CONFIG_BASICAUTH_USERNAME: admin
      ME_CONFIG_BASICAUTH_PASSWORD: change-me
    depends_on:
      - mongo
```

> **Turn sign-in on.** Like upstream, this image has **no login** unless `ME_CONFIG_BASICAUTH_ENABLED=true` is set, and it manages every
> database on the server it connects to. Do not expose it to a network you do not trust without a login.

## Configuration

Everything is configured with environment variables. All of upstream's `ME_CONFIG_*` settings work unchanged; see
[upstream's configuration table](https://github.com/Khuongnb/mongo-express-enhanced#usage-docker). The ones you will use most:

| Variable | Default | Description |
| - | - | - |
| `ME_CONFIG_MONGODB_URL` | `mongodb://mongo:27017` | MongoDB connection string. |
| `ME_CONFIG_MONGODB_ENABLE_ADMIN` | `true` | Manage every database on the server, not just one. |
| `ME_CONFIG_BASICAUTH_ENABLED` | `false` | Require a username and password. |
| `ME_CONFIG_BASICAUTH_USERNAME` / `_PASSWORD` | | Credentials for the above. |
| `ME_CONFIG_AUTH_STRATEGY` | | Set to `form` for a sign-in page instead of the browser's basic-auth prompt. |
| `ME_CONFIG_SITE_BASEURL` | `/` | Serve the app under a path prefix. |
| `ME_CONFIG_SITE_COOKIESECRET` / `_SESSIONSECRET` | random | Generated at start-up when unset. Set them to keep sessions across restarts. |
| `PORT` | `8081` | Port the app listens on. |

Added by this fork:

| Variable | Default | Description |
| - | - | - |
| `ME_CONFIG_DOCUMENTS_PER_PAGE` | `25` | Rows shown per page until someone picks another size in the toolbar (upstream's default is 10). |
| `ME_CONFIG_ENHANCED_MAX_PER_PAGE` | `250` | The most rows a page can show. |
| `ME_CONFIG_SITE_PROXY_STRIPS_BASEURL` | `false` | Your reverse proxy removes `ME_CONFIG_SITE_BASEURL` before forwarding to the app. |
| `ME_CONFIG_ENHANCED_INJECT_ASSETS` | `true` | Inject the enhanced stylesheet and script into every page. Leave it on; it exists for debugging. |

## Compatibility

- Based on mongo-express **1.1.0-rc-4**, with upstream's own image recipe as the base, so it is built on `node:24-alpine`.
- Tested against MongoDB **4.4** and **8.0**.

## Tags

| Tag | Notes |
| - | - |
| `e-v1.0.0-rc1` | Release candidate. **linux/arm64 only.** |

## Source, issues and licence

- Source and issues: https://github.com/Khuongnb/mongo-express-enhanced
- MIT licence, the same as upstream mongo-express. The original project is by Chun-hao Hu and contributors:
  https://github.com/mongo-express/mongo-express
