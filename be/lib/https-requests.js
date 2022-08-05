"use strict";

import https from "https";

class HttpsRequests {
  static async call(url, options = {}) {
    return new Promise((resolve, reject) => {
      let response = {
        body: "",
        headers: {},
        statusCode: 200,
        statusMessage: null
      };

      const req = https.request(url, options, (res) => {
        response.statusCode = res.statusCode;
        response.headers = res.headers;
        response.statusMessage = res.statusMessage;

        res.on("data", (d) => {
          response.body += d;
        });

        res.on("end", () => {
          resolve(response);
        });
      });

      req.on("error", (e) => {
        reject(e);
      });

      req.end();
    });
  }
}

export { HttpsRequests };
