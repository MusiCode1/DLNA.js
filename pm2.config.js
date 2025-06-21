/**
 * @type {import('pm2-config').PM2Config}
 */
const config = {
    apps: [{
        name: "backendServer",
        script: "./packages/server/src/index.ts",
        interpreter: "bun",
        env: {
            NODE_ENV: "development",
        },
    }, {
        name: 'rClone',
        script: 'C:\\programs\\rclone',
        args: [
            'serve',
            'dlna',
            'GoogleDrive:"תיקיית-סרטונים-למסך"',
            '--read-only',
            '--vfs-cache-mode',
            'full',

            '--vfs-cache-max-age',
            '999h0m0s',

            '--cache-dir',
            'C:\\Cache',

            '--config',
            'rclone.conf',

            '--fast-list',
            '--name',
            '"סרטונים מגוגל דרייב"',
            '--no-console',
            '--rc',
            '--rc-no-auth',
            '--rc-web-gui',

            '--rc-addr',
            ':5572',

            '--announce-interval',
            '10s'
        ]
    }, {
        name: "remoteControlServer",
        script: './packages/proxy-server/src/index.ts',
        interpreter: "bun"
    }]
};

module.exports = config;