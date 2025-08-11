# frontend/Dockerfile

FROM node:18

WORKDIR /app


COPY flowdeskai/package.json flowdeskai/package-lock.json ./ 


RUN npm install


COPY flowdeskai/ .

EXPOSE 3000

CMD ["npm", "start"]
