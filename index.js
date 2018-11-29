#!/usr/bin/env node

const program = require("commander")
const shell = require("shelljs")
// const mysql = require("mysql")
// const { execFileSync } = require('child_process');
const sudo = require("sudo-prompt")
const fs = require("fs")
const dotenv = require("dotenv")
const colors = require("colors")
colors.setTheme({
   silly: 'rainbow',
   input: 'grey',
   verbose: 'cyan',
   prompt: 'grey',
   info: 'green',
   data: 'grey',
   help: 'cyan',
   warn: 'yellow',
   debug: 'blue',
   error: 'red'
})

let laradock_home = "laradock"
let mysql_root_password = "root"
let nginx_vhost_file = "laradock/nginx/sites/laravel.conf.example"
const artisan_commands = `
composer install --prefer-dist --no-interaction --no-suggest &&
php artisan migrate:fresh --seed &&
php artisan key:generate &&
npm install &&
npm run production
`

program
   .option("-l, --laradock <path>", "Set Laradock installation directory name instead of default one `laradock`.")

program.on("option:laradock", (path) => {
   laradock_home = path
   nginx_vhost_file = `${path}/nginx/sites/laravel.conf.example`
})

program
   .command("new <name>")
   .action((name) => {
      // Trim trailing slash if present
      name = name.replace(/\/$/, "")

      assertWorkingDirectoryContains(laradock_home)

      try {
         const config = dotenv.config({ path: `${laradock_home}/.env`})
         mysql_root_password = config.parsed.MYSQL_ROOT_PASSWORD
      } catch (error) {}

      const mysql_command = `CREATE DATABASE ${name}; GRANT ALL PRIVILEGES ON ${name}.* TO '${name}'@'%' IDENTIFIED BY '${name}';`
      const mysql_test_command = `CREATE DATABASE ${name}_test; GRANT ALL PRIVILEGES ON ${name}_test.* TO '${name}_test'@'%' IDENTIFIED BY '${name}_test';`

      log(`Creating new Laradock project ${name} configuration...`, colors.info)

      if (!fs.existsSync(`${nginx_vhost_file}`)) {
         error(`Can't find laravel.conf.example. Do you want to download it?`)
      }

      shell.cp(nginx_vhost_file, `${laradock_home}/nginx/sites/${name}.conf`)
      shell.sed("-i", "laravel", name, `${laradock_home}/nginx/sites/${name}.conf`)

      // Stopping and upping to reload nginx config
      shell.cd(laradock_home)
      shell.exec("docker-compose restart nginx mysql") // needed if already running

      // TODO: add check on database existence
      log(`Creating ${name} database and user...`, colors.info)
      shell.exec(`docker-compose exec -T mysql mysql -u root -p${mysql_root_password} --execute="${mysql_command}"`)
      log(`Creating ${name}_test database and user...`, colors.info)
      shell.exec(`docker-compose exec -T mysql mysql -u root -p${mysql_root_password} --execute="${mysql_test_command}"`)

      log(`Updating /etc/hosts to make ${name}.test accessible. Need root permissions...`, colors.info)
      sudo.exec(`sed -i -e '$a127.0.0.1 ${name}.test' /etc/hosts`, {},
         function (err, stdout, stderr) {
            if (err) error(err)
         }
      )
   })
 
// Not ready yet  
/*
program
   .command("bash <name>")
   .action((name) => {
      // Trim trailing slash if present
      name = name.replace(/\/$/, "")
      assertWorkingDirectoryContains(laradock_home)
      assertWorkingDirectoryContains(name)
      shell.cd(laradock_home)
      // TODO: Sanitize input: name!!
      // -w need docker-compose.yml version field > 3 (3.7 works) (COMPOSE_API_VERSION doesn't work)
      execFileSync("docker-compose", ["exec", "-T", "-w", `/var/www/${name}`, "--user=laradock", "workspace", "bash"], { stdio: "inherit" })
      // execFileSync("docker-compose", ["exec", "-T", "--user=laradock", "workspace", "bash", "--init-file", `<(echo 'cd ${name}')`], { stdio: "inherit" })
      // execFileSync(`docker-compose exec -T --user=laradock workspace bash --init-file <(echo 'cd ${name}')`, { stdio: "inherit" })
   })
*/

program
   .command("rm <name>")
   .action((name) => {
      // Trim trailing slash if present
      name = name.replace(/\/$/, "")

      assertWorkingDirectoryContains(laradock_home)

      try {
         const config = dotenv.config({ path: `${laradock_home}/.env`})
         mysql_root_password = config.parsed.MYSQL_ROOT_PASSWORD
      } catch (error) {}
      

      log(`Deleting old Laradock project ${name} configuration...`, colors.info)

      shell.rm(`${laradock_home}/nginx/sites/${name}.conf`)

      const mysql_command = `DROP DATABASE ${name}; DROP USER '${name}'@'%';`
      const mysql_test_command = `DROP DATABASE ${name}_test; DROP USER '${name}_test'@'%';`

      shell.cd(laradock_home)
      shell.exec("docker-compose up -d nginx mysql")
      log(`Deleting ${name} database and user...`, colors.info)
      shell.exec(`docker-compose exec -T mysql mysql -u root -p${mysql_root_password} --execute="${mysql_command}"`)
      log(`Deleting ${name}_test database and user...`, colors.info)
      shell.exec(`docker-compose exec -T mysql mysql -u root -p${mysql_root_password} --execute="${mysql_test_command}"`)

      sudo.exec(`sed -i "/.*${name}.test/d" /etc/hosts`, {},
         function (err, stdout, stderr) {
            if (err) error(err)
         }
      )
   })

// TODO: discover existing projects
// program
//    .command("discover")
//    .action(() => {
//       log("TODO: Updating existing configuration to reflect directory structure...", colors.info)
//    })

program
   .command("init <name>")
   .action((name) => {
      // Trim trailing slash if present
      name = name.replace(/\/$/, "")

      assertWorkingDirectoryContains(laradock_home)
      assertWorkingDirectoryContains(name)

      log(`Initializing ${name} laravel project inside ${name} directory...`, colors.info)
      log(`Updating .env and .env.testing...`, colors.info)

      // TODO: Ask for input if .env / .env.testing is already present, maybe he wants to merge it
      const changes = {
         DB_HOST: "mysql",
         DB_USERNAME: name,
         DB_PASSWORD: name,
         DB_DATABASE: name,
         APP_URL: `http://${name}.test`
      }

      const testing = {
         DB_HOST: "mysql",
         DB_USERNAME: `${name}_test`,
         DB_PASSWORD: `${name}_test`,
         DB_DATABASE: `${name}_test`,
         APP_ENV: "testing",
         APP_URL: `http://${name}.test`
      }
      override_env({
         from: `${name}/.env.example`,
         to: `${name}/.env`,
         changes: changes
      })

      override_env({
         from: `${name}/.env.example`,
         to: `${name}/.env.testing`,
         changes: testing
      })
      
      // execute artisan commands as script
      shell.cd(laradock_home)
      shell.exec("docker-compose up -d nginx mysql")
      shell.exec(`docker-compose exec -T --user=laradock workspace bash -c 'cd ${name} && ${artisan_commands}'`)
   })

program.parse(process.argv)

// Copy env file and override some keys
function override_env({ from, to, changes }) {
   shell.cp(from, to)
   for ([key, value] of Object.entries(changes)) {
      shell.sed("-i", new RegExp(key + "=.*"), `${key}=${value}`, to)
   }
}

function error(error) {
   console.error(colors.error("FATAL: ") + error)
   process.exit(1)
}

// Helper to color output
function log(log, color) {
   console.log(color(log))
}

function assertWorkingDirectoryContains(dir) {
   if (!fs.existsSync(dir)) {
      error(`Can't find ${dir} directory. Have you tried -l option to set laradock root folder?`)
   }
}

// function mysqlCreateDatabase({database, user="root", password="root"}) {
//    const connection = mysql.createConnection({
//       host: "mysql",
//       user: user,
//       password: password
//    })
//    // TODO: create db and user with mysql package
// }
