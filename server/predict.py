import sys
import json
import sqlite3
import pandas as pd
import numpy as np
import joblib

DB_PATH = 'stats.db'

# Load model and scalers
model = joblib.load('price_model.pkl')
scaler_X = joblib.load('scaler_X.pkl')
scaler_y = joblib.load('scaler_y.pkl')

# Optionally accept hashrate from command line (not used here)
hashrate = sys.argv[1] if len(sys.argv) > 1 else None

# Fetch the latest row from DB to create features
conn = sqlite3.connect(DB_PATH)
df = pd.read_sql_query("SELECT * FROM mining_data ORDER BY timestamp DESC LIMIT 1", conn)
conn.close()

if df.empty:
    print(json.dumps({"error": "No data in DB"}))
    sys.exit(1)

# Recreate lag features exactly as in training
# You need to know the lag columns used; we'll assume they are in the DB or we compute them.
# For simplicity, we'll hardcode the feature list (same as training)
# In practice, save the feature columns list during training.
# For demonstration, we'll compute lags from the last few rows.

# Better: fetch the last 24 rows and compute lags on the fly
conn = sqlite3.connect(DB_PATH)
df_hist = pd.read_sql_query("SELECT * FROM mining_data ORDER BY timestamp DESC LIMIT 25", conn)
conn.close()
df_hist = df_hist.iloc[::-1]  # reverse to chronological order
df_hist['timestamp'] = pd.to_datetime(df_hist['timestamp'])
df_hist.set_index('timestamp', inplace=True)

# Compute lags (same as training)
for lag in [1, 3, 6, 12, 24]:
    df_hist[f'price_lag_{lag}'] = df_hist['price_usd'].shift(lag)
    df_hist[f'hash_lag_{lag}'] = df_hist['network_hash'].shift(lag)
    df_hist[f'diff_lag_{lag}'] = df_hist['difficulty'].shift(lag)

latest = df_hist.iloc[-1:]  # the last row (most recent)
# Select only feature columns (those with 'lag' in name)
features = [col for col in latest.columns if 'lag' in col]
X_latest = latest[features].values.reshape(1, -1)

# Scale and predict
X_scaled = scaler_X.transform(X_latest)
pred_scaled = model.predict(X_scaled)
pred = scaler_y.inverse_transform(pred_scaled.reshape(-1, 1))[0][0]

# Also return the latest actual price for comparison
latest_price = latest['price_usd'].iloc[0]

result = {
    "predicted_price": float(pred),
    "latest_price": float(latest_price),
    "timestamp": latest.index[0].isoformat()
}
print(json.dumps(result))