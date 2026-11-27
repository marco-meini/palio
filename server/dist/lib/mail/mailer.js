import nodemailer from 'nodemailer';
export class SmtpMailer {
    config;
    transport;
    constructor(config) {
        this.config = config;
        this.transport = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            requireTLS: !config.secure,
            auth: { user: config.user, pass: config.password },
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 20_000,
        });
    }
    async send(message) {
        await this.transport.sendMail({ from: this.config.from, ...message });
    }
}
//# sourceMappingURL=mailer.js.map