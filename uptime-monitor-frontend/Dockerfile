# Build stage
FROM node:14-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker caching
COPY package*.json ./

# Install all dependencies
RUN npm install --no-optional

# Copy the rest of the application source code
COPY . .

# Build the React app
RUN npm run build

# Final stage: Serve the app using Nginx
FROM nginx:alpine

# Copy the built React app to the Nginx directory
COPY --from=builder /app/build /usr/share/nginx/html

# Expose the default Nginx port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]

