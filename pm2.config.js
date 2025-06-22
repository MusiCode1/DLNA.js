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
        cwd: './packages/server',
        interpreter_args: [
            '--cwd=./packages/server',
        ]
    }, {
        name: 'rClone',
        script: 'C:/programs/rclone/rclone.exe',
        cwd: 'C:/programs/rclone/',
        args: [
            'serve',
            'dlna',
            'GoogleDrive:/תיקיית-סרטונים-למסך',
            '--read-only',
            '--vfs-cache-mode', 'full',
            '--config', 'C:/programs/rclone/rclone.conf',
            '--vfs-cache-max-age', '999h0m0s',
            '--cache-dir', 'C:/Cache',
            '--fast-list',
            '--name', '"סרטונים מגוגל דרייב"',
            '--rc-addr', ':5572',
            '--announce-interval', '10s',
            /* '--log-level', 'DEBUG', */
            /* '--no-console', */
            '--rc',
            '--rc-no-auth',
            '--rc-web-gui',

        ]
    }, {
        name: "remoteControlServer",
        script: './packages/proxy-server/src/index.ts',
        interpreter: "bun",
        cwd: './packages/proxy-server',
        interpreter_args: [
            '--cwd=./packages/proxy-server',
        ]

    }]
};

module.exports = config;