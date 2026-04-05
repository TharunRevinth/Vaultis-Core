# Vaultis Core – Secure Banking Engine

**Vaultis Core** is an institucional-grade, high-performance banking core system. It combines a modern, high-fidelity web interface with a high-speed C++ engine compiled to WebAssembly (WASM) for critical financial processing.

![Platform Overview](https://images.unsplash.com/photo-1550565118-3a14e8d0386f?auto=format&fit=crop&w=1200&q=80)

## 🚀 Core Technologies

- **High-Performance Logic**: C++ 17 compiled via Emscripten for deterministic, low-latency financial reconciliation.
- **Modern Frontend**: Semantic HTML5, Vanilla JavaScript (ES6+), and a custom CSS Utility-first design system.
- **Cloud Infrastructure**: [Supabase](https://supabase.com/) for real-time Postgres synchronization, Row-Level Security (RLS), and identity management.
- **Live Bridge**: Integrated Signal Handshake system for secure Manager-Member remote assistance.

## 🔒 Key Features

- **Institutional Portfolios**: Real-time management of Savings, Fixed Deposits, and Global Assets.
- **Session Handshake**: Advanced security protocol allowing managers to assist members securely via temporary recovery tokens.
- **Society Intelligence**: Aggregated liquidity reports and regulatory compliance tracking (₹500 threshold monitoring).
- **Transaction Ledger**: Filterable, paginated transaction history with e-statement generation capabilities.
- **Deterministic Processing**: All core math (deposits, withdrawals) is handled by the WASM engine, separate from the UI layer.

## 🛠 Project Structure

```text
├── css/                # Custom bank design system
├── js/                 # Dashboard logic and Supabase integration
├── main.cpp            # C++ Source Code (The Banking Engine)
├── engine.js/wasm      # Compiled WASM binaries
├── server.js           # Express development server
└── index.html          # Core portal interface
```

## ⌨️ Development

### Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the Master Server:
   ```bash
   node server.js
   ```
3. Access the portal at `http://localhost:3001` or `http://localhost:3000`.

### Recompiling the Core (Optional)

If you have the Emscripten SDK installed:
```bash
emcc main.cpp -o engine.js -s EXPORTED_FUNCTIONS='["_create_account", "_deposit", "_withdraw", "_get_total_money", "_get_below_threshold_count", "_clear_system", "_main"]' -s EXPORTED_RUNTIME_METHODS='["cwrap"]' -O3
```

## 📄 License
Institutional Property of Vaultis Core. All Rights Reserved.
