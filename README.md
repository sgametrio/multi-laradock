# MultiLaradock

### What is it?

MultiLaradock is a Command Line Interface program born to automate Laravel development configuration in a multiproject Laradock setup. 

__It is NOT__ a general-purpose Laradock CLI. I don't have time and experience to build and mantain something like that.

### When do you use it?

When you have a Laravel project and you want to serve it using existent Laradock environment without breaking things.

#### Use case

We have a project setup like this:

```shell
+ laradock/		# Laradock multiproject installation directory
+ project-1/	# A project served by Laradock
+ project-2/	# Another project served by Laradock
...
+ project-x/	# An existent project NOT configured by being served by Laradock
```

Laradock is (already!) configured to serve multiple projects on different URLs like `http://project-1.test` and `http://project-2.test`.

We want to serve __project-x__ over `http://project-x.test`.
__Before__: had to modify NGINX configuration, modify `/etc/hosts`, create a different database, create a database for testing, and change laravel `.env` and `.env.testing` variables to connect respectively to db.
__Now__: run `multi-laradock project-x`  and open `http://project-x.test`!

### What does it do?

1. Create `nginx` virtual host by copying over `laravel.conf.example`
2. Edit `/etc/hosts` (if given permission)
3. Create a database for development
4. Create a database and a user for testing
5. Edit `[project-x]/.env` and `[project-x]/.env.testing`
   If already present ask what to do (maybe rename to .env.old? or create .env.alternative? or override)

### Installation and usage

To install you have to use a package manager for Node:

```
npm install -g multi-laradock
```

Change working directory to be in the parent folder of `laradock` and `[project-name]` like the example presented before.
Run:

```bash
multi-laradock [project_name]
```

Now, you're ready to go!

#### Options

* `new <name>` : create configuration for `<name>`.
* `init <name>` : cp .env and .env.testing, install deps and migrate:fresh onto `<name>`.
* `rm <name>` : remove existing configuration for `<name>`. 
  __Pay attention__: it will remove database and user too!

### How?

```c++

/**
* 5 - Link laravel project .env to use these credentials
*     > cp .env.example .env if not existent
*     > replace-in-file DB_HOST, (?) DB_USERNAME, DB_DATABASE, (?) DB_PASSWORD
*/
```

### Why?

I develop Laravel applications using NGINX and MySQL mostly. I needed a fast and reliable way to add a new project into my existing development setup.