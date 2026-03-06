#!/bin/bash
echo "Starting MediCare Assistant Backend..."
echo ""

echo "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

node --version
echo ""

echo "Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "Error: Failed to install dependencies"
    exit 1
fi

echo ""
echo "Starting server..."
npm start