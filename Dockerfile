FROM node:6

RUN npm install -g forever

WORKDIR /src

COPY package.json .

RUN npm install

COPY . .

CMD /src/scripts/docker-start.sh

EXPOSE 8080
