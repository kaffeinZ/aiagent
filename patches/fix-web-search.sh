#!/bin/bash
# Permanent fix for @elizaos/plugin-web-search bug:
# When Tavily returns results but no summarized "answer" (answer: null),
# the plugin sends empty text to the agent instead of the actual results.
# This patch falls back to formatting individual results.

SEARCH_FILE="node_modules/@elizaos/plugin-web-search/dist/index.js"

if [ -f "$SEARCH_FILE" ]; then
  sed -i 's|const responseList = searchResponse.answer ? `${searchResponse.answer}` : "";|const responseList = searchResponse.answer ? `${searchResponse.answer}` : searchResponse.results.map((r) => `${r.title}: ${r.content} (${r.url})`).join("\\n\\n");|' "$SEARCH_FILE"
  echo "[patch] Fixed plugin-web-search empty answer fallback"
else
  echo "[patch] plugin-web-search not found, skipping"
fi
