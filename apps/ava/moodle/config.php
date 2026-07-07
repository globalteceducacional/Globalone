<?php  // Moodle configuration file — Docker (VPS)
// Senhas e URL vêm do arquivo .env (variáveis de ambiente do container).

unset($CFG);
global $CFG;
$CFG = new stdClass();

$env = static function (string $name): string {
    $value = getenv($name);
    if ($value === false || $value === '') {
        die('Variavel de ambiente obrigatoria nao definida: ' . $name . '. Verifique o arquivo .env');
    }
    return $value;
};

$CFG->dbtype    = 'mariadb';
$CFG->dblibrary = 'native';
$CFG->dbhost    = $env('MOODLE_DB_HOST');
$CFG->dbname    = $env('MOODLE_DB_NAME');
$CFG->dbuser    = $env('MOODLE_DB_USER');
$CFG->dbpass    = $env('MOODLE_DB_PASSWORD');
$CFG->prefix    = 'mdl_';
$CFG->dboptions = array(
    'dbpersist' => 0,
    'dbport' => 3306,
    'dbsocket' => '',
    'dbcollation' => 'utf8mb4_unicode_ci',
);

$CFG->wwwroot   = $env('MOODLE_WWWROOT');
$CFG->dataroot  = $env('MOODLE_DATAROOT');
$CFG->admin     = 'admin';
$CFG->sslproxy  = true;
$CFG->preventexecpath = true;

$CFG->directorypermissions = 02770;

require_once(__DIR__ . '/lib/setup.php');
