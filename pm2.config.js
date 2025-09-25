/**
 * @type {import('pm2-config').PM2Config}
 */
const config = {
    apps: [
        {
            name: "backendServer",
            script: "./src/index.ts", // נתיב יחסי לנתיב העבודה
            cwd: './packages/server',
            interpreter: "C:/programs/bun.exe",
            /* script: "C:/programs/bun.exe", */
            /* args: [
                "run", "start"
            ], */
            env: {
            },

            interpreter_args: [
                /* '--inspect-brk' */
                /*  '--cwd=./packages/server', */ // לא צריך. זה מיותר
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
                '--announce-interval', '1m',
                // '--log-level', 'DEBUG',
                // '--no-console',
                '--rc',
                '--rc-no-auth',
                '--rc-web-gui',

            ]
        }, {
            name: "remoteControlServer",
            script: './src/index.ts',
            interpreter: "C:/programs/bun.exe",
            cwd: './packages/proxy-server',
            interpreter_args: [
                // '--cwd=./packages/proxy-server',
            ]

        }
    ]
};

module.exports = config;