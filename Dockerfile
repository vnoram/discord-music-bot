FROM node:18-alpine

# ffmpeg is required for audio transcoding; alpine's ffmpeg package ships
# with libopus/libvorbis support needed by @discordjs/voice.
RUN apk add --no-cache ffmpeg curl

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "src/index.js"]
