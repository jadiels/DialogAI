# --- build stage -------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The default build targets GitHub Pages (base /DialogAI/); when self-hosting we
# serve the app from the site root instead.
RUN npm run build -- --base=/

# --- runtime stage -----------------------------------------------------------
FROM nginx:alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
