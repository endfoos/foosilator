#!/bin/bash

echo "Starting Node process"
echo
echo "---> Node environment: '$NODE_ENV'"
echo "---> Application port: '$PORT'"
forever --sourceDir /src/ ./app.js
echo
