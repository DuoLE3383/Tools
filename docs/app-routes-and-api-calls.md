# App Routes & API Calls — Complete Architecture

This document describes the route and API call architecture of the NiceHash/MRR mining tools application.

## 🏗 Architecture Overview
- **Backend**: Express.js (started via `node index.js` or `npm run backend`)
- **Frontend**: React SPA (served by Vite during dev, or as `dist/index.html`)
- **Port**: Backend listens on port defined in `PORT` env (default 3003)
- **Auth**: JWT token stored in `localStorage('token')`, passed via `Authorization: Bearer` or query param `?token=`
- **Database**: SQLite via `better-sqlite3` (stats.db, mining_training.db, etc.)
- **WebSocket**: Available at `ws://localhost:PORT/api/v2/prices/ws`

## 🔐 Authentication Flow
1. Login: `POST /api/auth/login` → returns `{ token }`
2. Token stored in `localStorage`
3. All API calls include `Authorization: Bearer <token>` header
4. Session keepalive: silent `GET /api/v2/time` every 30 seconds
5. On 401/403: frontend auto-logout
6. Token refresh: `POST /api/auth/refresh` (works even if token is expired, as long as session is valid)

## ✅ Public Endpoints (no auth required)
- `GET /api/health`
- `GET /api/heartbeat`
- `GET /ping`
- `GET /api/status`
- `GET /api/auth/login`
- `GET /api/v2/time`
- `GET /api/v2/prices/coingecko`
- `GET /api/v2/prices/ws` (WebSocket upgrade)
- `GET /api/v2/mining-stats/*`

## 🗺 Complete Route Table (100+ endpoints)

### Health / Status
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/heartbeat` | Heartbeat with timestamp |
| GET | `/ping` | Simple pong |
| GET | `/api/status` | System status summary |

### Auth (`/api/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | Public | Login, returns token |
| POST | `/refresh` | Public | Refresh expired token |
| POST | `/logout` | Required | Logout, invalidate session |
| GET | `/profile` | Required | Current user profile |
| GET | `/permissions` | Required | User permissions |
| GET | `/users` | Admin | List users |
| POST | `/users` | Admin | Create user |
| PUT | `/users/:username/role` | Admin | Change user role |
| PUT | `/users/:username/disable` | Admin | Disable user |

### NiceHash Mining (`/api/v2/` — middleware resolves NH client)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/time` | NH server time |
| GET | `/algorithms` | List algorithms |
| GET | `/public/currency-algos` | Currency algos |
| GET | `/mining/markets` | Markets |
| GET | `/public/stats/24h` | 24h global stats |
| GET | `/nicehash-algos` | Static algo JSON |
| GET | `/algos/mapping` | NH↔MRR algo mapping |
| GET | `/accounting/balances` | All balances |
| GET | `/accounting/balance/:currency` | Balance by currency |
| POST | `/accounting/withdrawal` | Create withdrawal |
| GET | `/mining/address` | Mining address |
| GET | `/mining/rigs2` | All rigs |
| GET | `/mining/rig/:rigId` | Rig detail |
| POST | `/mining/rigs/status` | Set rig statuses |
| GET | `/mining/payouts` | Payout history |
| GET | `/mining/history` | Rig history |
| GET | `/mining/algo-stats` | Algo stats |
| GET | `/nh-mining/profit` | Profit per algo |

### NiceHash Hashpower Orders (`/api/v2/hashpower/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/myOrders` | My orders |
| GET | `/rented-summary?price=X` | Summary below price |
| GET | `/order/price?algo=X&market=X` | Best price |
| GET | `/orderBook/:algo/:market` | Order book |
| GET | `/order/:orderId` | Order detail |
| POST | `/order` | Create order |
| GET | `/order-book` | Order book (query) |
| DELETE | `/order/:orderId` | Cancel order |
| POST | `/order/:orderId/refill` | Refill order |
| POST | `/order/:orderId/update` | Update price/limit |

### NiceHash Pools (`/api/v2/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/pools` | List pools |
| GET | `/pool/:poolId` | Pool detail |
| POST | `/pool` | Create pool |
| POST | `/pools/verify` | Verify pool |
| POST | `/pools/verify-browser` | Browser verification |

### Batch Order Update
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v2/hashpower/orders/update-prices` | Batch update NH prices |

### MRR (`/api/v2/mrr/`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/monitor/run` | Run rental monitor |
| GET | `/market/algos/:algo` | Market algo |
| GET | `/info/algos` | Public algo info |
| GET | `/rigs` | All rigs (aggregated) |
| GET | `/rigs/pools` | Rig pools |
| GET | `/rig` | Rigs proxy |
| GET | `/rig/all` | All rigs |
| GET | `/rig/:rigIds` | Rig detail |
| GET | `/rig/:rigIds/pool` | Rig pool config |
| GET | `/rig/:rigIds/info` | Rig + NH price |
| PUT | `/rig/:rigId` | Update rig |
| GET | `/rentals` | Active rentals |
| GET | `/rentals/cached` | Cached from DB |
| GET | `/rental/history` | History |
| GET | `/rental/:rentalIds` | Rental detail |
| GET | `/rental/:rentalIds/pool` | Rental pool |
| GET | `/balance` | Balance |
| GET | `/algos` | Algos list |
| GET | `/profiles` | Profiles |
| GET | `/whoami` | Account info |
| GET | `/clients` | Configured clients |
| GET | `/compare` | NH vs MRR compare |
| POST | `/call` | Generic proxy call |
| GET | `/account/pool` | Account pools |
| GET | `/account/pool/:poolIds` | Pool detail |
| POST | `/account/pool` | Create pool |
| PUT | `/account/pool` | Update pool |
| PUT | `/account/pool/:poolIds` | Update by ID |
| DELETE | `/account/pool/:poolIds` | Delete pool |

### Misc (`/api/v2/`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/notify/telegram` | Send Main Bot Telegram |
| POST | `/telegram/send-mine` | Send Mine Bot Telegram |
| GET | `/prices/db/:coinId` | Coin price from DB |
| POST | `/prices/update` | Trigger price scan |
| GET | `/notify/opportunity-alerts/status` | Alert status |
| POST | `/notify/opportunity-alerts/status` | Toggle alerts |
| GET | `/notify/telegram/health` | Telegram health |
| POST | `/test/rented-notice` | Send test |
| GET | `/mrr/monitor/snapshot` | Monitor snapshot |
| DELETE | `/mrr/monitor/snapshot/:id` | Delete |
| PATCH | `/mrr/monitor/snapshot/:id` | Update |
| GET | `/extracted-pools` | Extracted pools |
| POST | `/mining/training-snapshot` | Save training data |
| GET | `/mining/opportunities/scan` | Scan opportunities |

### Mining Stats (`/api/v2/mining-stats/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/herominers` | HeroMiners data |
| GET | `/miningdutch` | MiningDutch profitability |
| GET | `/all` | Combined |
| GET | `/hashrate.no` | Fallback |
| GET | `/minerstat` | Minerstat scrape |
| GET | `/whattomine` | WhatToMine scrape |
| GET | `/k1pool?pool=X&address=X` | K1Pool |
| GET | `/kryptex?coin=X&address=X` | Kryptex stats |
| GET | `/kryptex/history` | Kryptex history |
| GET | `/kryptex/monitor-summary` | Kryptex summary |

### Coin Prices (`/api/v2/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/prices/coingecko?ids=bitcoin,...` | Prices from DB |
| GET | `/coins/list` | All known coins |

### Static Frontend Catch-All
| Method | Path | Description |
|--------|------|-------------|
| GET | `/*` | Serves `dist/index.html` (SPA) |

## 🔌 Frontend API Client (`callApi`)
Defined in `Main.jsx`. It:
- Automatically appends `ts` (timestamp) and `client` (NH client tag) to all `/api/v2/` NH endpoints
- Attaches `Authorization: Bearer <token>` if logged in
- Deduplicates in-flight GET requests
- On 401/403 → auto-logout
- Supports `options.silent` to suppress loading/error UI
- Supports `options.showModal` to display response in API modal

## 📁 Source Files
- `index.js` — Server entry, startup sequence, health routes
- `server/app.js` — Express app creation, CORS, middleware
- `server/routes.js` — Route registration hub
- `server/routes/nicehash.js` — 25+ NH endpoints
- `server/routes/mrr.js` — 25+ MRR endpoints
- `server/routes/misc.js` — 15+ misc endpoints
- `server/routes/miningStats.js` — 10+ mining stat endpoints
- `server/routes/coinGecko.js` — Price & coin list
- `server/auth.js` — JWT auth logic
- `Main.jsx` — React main component with `callApi()` client