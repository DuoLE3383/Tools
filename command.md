node server/verify-all-accounts.js --client=LN --loops=0 --verbose --delay=2200 --interval=2


# Process PH first, then BT (order preserved)
node server/verify.js --client=PH,BT --verbose --export --loops=0

# Process BT first, then PH
node server/verify.js --client=BT,PH --verbose --export --loops=0

# Process any order you want
node server/verify.js --client=PH,BT,LN --verbose --export --loops=0


Usage:
  node server/verify-all-accounts.js [options]

Options:
  --client=<CLIENT1,CLIENT2>  Clients to verify (comma-separated)
  --loops=<N>                 Number of loops (0 = infinite)
  --interval=<S>              Interval between loops in seconds (default: 30)
  --delay=<MS>                Delay between pools in ms (default: 2500)
  --verbose, -v               Enable verbose logging
  --export, -e                Export results to JSON file
  --no-preserve-order         Process clients in alphabetical order instead of specified order
  --help, -h                  Show this help

Examples:
  # Process PH first, then BT
  node server/verify-all-accounts.js --client=PH,BT --verbose --export --loops=0
  
  # Process BT first, then PH (default order)
  node server/verify-all-accounts.js --client=BT,PH --verbose --export --loops=0
  
  # Process in alphabetical order (BT, PH)
  node server/verify-all-accounts.js --client=PH,BT --no-preserve-order --loops=0