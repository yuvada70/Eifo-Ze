# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────
#  שלב הבנייה
#
#  מתקין את כל התלויות (כולל תלויות פיתוח, הנחוצות ל-TypeScript
#  ול-Vite), בונה את שלוש החבילות, ואז מסלק את תלויות הפיתוח כדי
#  שהתמונה הסופית תישאר קטנה.
# ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# העתקת קבצי המניפסט בלבד תחילה — כך שכבת ההתקנה נשמרת במטמון
# כל עוד התלויות לא השתנו.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm ci

COPY tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
COPY client ./client
COPY data ./data

RUN npm run build && npm prune --omit=dev

# ─────────────────────────────────────────────────────────────────
#  שלב ההרצה
# ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    CLIENT_DIR=client/dist

WORKDIR /app

# הרצה כמשתמש לא-מנהל.
USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/shared/package.json ./shared/package.json
COPY --from=build --chown=node:node /app/shared/dist ./shared/dist
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/client/dist ./client/dist
# מאגר המקומות — מקור האמת הוא הקובץ ב-repo.
COPY --from=build --chown=node:node /app/data ./data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# הרצה ישירה של node (ולא דרך npm) — כך אותות SIGTERM מגיעים
# לתהליך והכיבוי המסודר עובד.
CMD ["node", "server/dist/index.js"]
