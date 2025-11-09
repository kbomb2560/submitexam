<?php
/**
 * Exam Proctor Registration API
 * PHP 5.6 compatible implementation (mysqli)
 *
 * Features
 * - API-Key authentication via X-API-Key header or api_key query param
 * - CORS headers + OPTIONS preflight
 * - POST /?action=register : store registration with high precision timestamp
 * - GET  /?action=list     : list registrations (admin view)
 * - GET  /?action=stats    : summary analytics (admin dashboard)
 */

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

$config = array(
    'db_host' => '127.0.0.1',
    'db_user' => 'academic',
    'db_pass' => 'webacademic',
    'db_name' => 'pcru_submitexam',
    'db_charset' => 'utf8mb4',
    'api_key' => 'academic-pcru',
    'allow_origin' => '*',
    'exam_date' => '2568-12-07',
    'admin_roles' => array('admin', 'administrator', 'ผู้ดูแลระบบ', 'ผู้ดูแล'),
    'admin_emp_codes' => array('653004', '140014'),
    'registration_capacity' => array(
        'primary' => 300,
        'reserve' => 10,
        'total' => 310
    ),
    'registration_capacity' => array(
        'primary' => 300,
        'reserve' => 10,
        'total' => 310
    ),
    'registration_window_default' => array(
        'opens_at' => '2025-11-09 09:00:00',
        'closes_at' => '2025-11-12 23:59:00',
        'timezone' => 'Asia/Bangkok'
    )
);

// -----------------------------------------------------------------------------
// Utility helpers
// -----------------------------------------------------------------------------

function send_json($status, $http_code, $message, $data = null)
{
    if (!headers_sent()) {
        http_response_code($http_code);
    }

    $payload = array(
        'status' => (bool) $status,
        'message' => $message
    );

    if ($data !== null) {
        $payload['data'] = $data;
    }

    echo json_encode($payload);
    exit;
}

function get_header_value($name)
{
    $name_upper = strtoupper(str_replace('-', '_', $name));
    $key = 'HTTP_' . $name_upper;
    if (!empty($_SERVER[$key])) {
        return $_SERVER[$key];
    }

    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (isset($headers[$name])) {
            return $headers[$name];
        }
        $lower = strtolower($name);
        foreach ($headers as $hKey => $value) {
            if (strtolower($hKey) === $lower) {
                return $value;
            }
        }
    }

    return null;
}

function validate_api_key($expected)
{
    $header_key = get_header_value('X-API-Key');
    $query_key = isset($_GET['api_key']) ? $_GET['api_key'] : null;

    if ($expected && $expected !== '') {
        if ($header_key === $expected || $query_key === $expected) {
            return true;
        }
        send_json(false, 401, 'Invalid API Key');
    }

    return true;
}

function derive_gender_from_prefix($prefix)
{
    $prefix = trim((string) $prefix);
    if ($prefix === '') {
        return 'ไม่ระบุ';
    }
    if (strpos($prefix, 'นาย') === 0 || stripos($prefix, 'Mr') === 0) {
        return 'ชาย';
    }
    if (strpos($prefix, 'นางสาว') === 0 || strpos($prefix, 'นาง') === 0 || stripos($prefix, 'Mrs') === 0 || stripos($prefix, 'Ms') === 0) {
        return 'หญิง';
    }
    return 'ไม่ระบุ';
}

function normalize_user_type($value)
{
    $value = trim((string) $value);
    if ($value === '') {
        return 'employee';
    }
    return strtolower($value);
}

function is_admin_role($user_type, $admin_roles)
{
    $user_type = strtolower(trim((string) $user_type));
    foreach ($admin_roles as $role) {
        if ($user_type === strtolower($role) || strpos($user_type, strtolower($role)) !== false) {
            return true;
        }
    }
    return false;
}

function get_registration_capacity($config)
{
    if (isset($config['registration_capacity']) && is_array($config['registration_capacity'])) {
        $capacity = $config['registration_capacity'];
        $primary = isset($capacity['primary']) ? (int) $capacity['primary'] : 300;
        $reserve = isset($capacity['reserve']) ? (int) $capacity['reserve'] : 10;
        $total = isset($capacity['total']) ? (int) $capacity['total'] : ($primary + $reserve);
        if ($total <= 0) {
            $total = $primary + $reserve;
        }
        return array(
            'primary' => $primary,
            'reserve' => $reserve,
            'total' => $total
        );
    }

    $fallback_primary = isset($config['registration_capacity_primary']) ? (int) $config['registration_capacity_primary'] : 300;
    $fallback_reserve = isset($config['registration_capacity_reserve']) ? (int) $config['registration_capacity_reserve'] : 10;
    $fallback_total = isset($config['registration_capacity_total']) ? (int) $config['registration_capacity_total'] : ($fallback_primary + $fallback_reserve);
    if ($fallback_total <= 0) {
        $fallback_total = $fallback_primary + $fallback_reserve;
    }

    return array(
        'primary' => $fallback_primary,
        'reserve' => $fallback_reserve,
        'total' => $fallback_total
    );
}

function ensure_registration_window_table($mysqli, $config)
{
    $create_sql = 'CREATE TABLE IF NOT EXISTS exam_proctor_windows (
        id INT AUTO_INCREMENT PRIMARY KEY,
        opens_at DATETIME NOT NULL,
        closes_at DATETIME NOT NULL,
        timezone VARCHAR(64) NOT NULL DEFAULT "Asia/Bangkok",
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    $mysqli->query($create_sql);

    $check_sql = 'SELECT COUNT(*) AS total FROM exam_proctor_windows';
    $result = $mysqli->query($check_sql);
    if ($result) {
        $row = $result->fetch_assoc();
        $result->free();
        if ((int) $row['total'] === 0) {
            $default = isset($config['registration_window_default']) ? $config['registration_window_default'] : array();
            $tz_name = isset($default['timezone']) ? $default['timezone'] : 'Asia/Bangkok';
            $timezone = new DateTimeZone($tz_name);

            $open_value = isset($default['opens_at']) ? $default['opens_at'] : 'now';
            $close_value = isset($default['closes_at']) ? $default['closes_at'] : '+3 days';

            $open_dt = parse_datetime_with_timezone($open_value, $timezone);
            $close_dt = parse_datetime_with_timezone($close_value, $timezone);

            if (!($open_dt instanceof DateTime)) {
                $open_dt = new DateTime('now', $timezone);
            }
            if (!($close_dt instanceof DateTime)) {
                $close_dt = new DateTime('+3 days', $timezone);
            }

            if ($close_dt <= $open_dt) {
                $close_dt = clone $open_dt;
                $close_dt->modify('+3 days');
            }

            $insert_stmt = $mysqli->prepare('INSERT INTO exam_proctor_windows (opens_at, closes_at, timezone) VALUES (?, ?, ?)');
            if ($insert_stmt) {
                $open_mysql = format_datetime_for_mysql($open_dt, $timezone);
                $close_mysql = format_datetime_for_mysql($close_dt, $timezone);
                $tz_string = $timezone->getName();
                $insert_stmt->bind_param('sss', $open_mysql, $close_mysql, $tz_string);
                $insert_stmt->execute();
                $insert_stmt->close();
            }
        }
    }
}

function parse_datetime_with_timezone($value, $timezone)
{
    if ($value instanceof DateTime) {
        return clone $value;
    }

    if ($timezone instanceof DateTimeZone) {
        $tz = $timezone;
    } else {
        $tz = new DateTimeZone((string) $timezone);
    }

    if (is_numeric($value)) {
        $dt = new DateTime('@' . $value);
        $dt->setTimezone($tz);
        return $dt;
    }

    $text = trim((string) $value);
    if ($text === '') {
        return null;
    }

    $formats = array(
        'Y-m-d H:i:s.u',
        'Y-m-d H:i:s',
        'Y-m-d\TH:i:s.uP',
        'Y-m-d\TH:i:sP',
        DateTime::ISO8601
    );

    foreach ($formats as $format) {
        $dt = DateTime::createFromFormat($format, $text, $tz);
        if ($dt instanceof DateTime) {
            return $dt;
        }
    }

    try {
        $dt = new DateTime($text, $tz);
        return $dt;
    } catch (Exception $e) {
        return null;
    }
}

function format_datetime_for_mysql($value, $timezone)
{
    if (!($value instanceof DateTime)) {
        $value = parse_datetime_with_timezone($value, $timezone);
    }
    if (!($value instanceof DateTime)) {
        return null;
    }
    if (!($timezone instanceof DateTimeZone)) {
        $timezone = new DateTimeZone((string) $timezone);
    }
    $dt = clone $value;
    $dt->setTimezone($timezone);
    return $dt->format('Y-m-d H:i:s');
}

function load_registration_window($mysqli, $config)
{
    ensure_registration_window_table($mysqli, $config);

    $default = isset($config['registration_window_default']) ? $config['registration_window_default'] : array();
    $tz_name = isset($default['timezone']) ? $default['timezone'] : 'Asia/Bangkok';
    $timezone = new DateTimeZone($tz_name);
    $open_dt = parse_datetime_with_timezone(isset($default['opens_at']) ? $default['opens_at'] : 'now', $timezone);
    $close_dt = parse_datetime_with_timezone(isset($default['closes_at']) ? $default['closes_at'] : '+3 days', $timezone);
    $source = 'default';

    $sql = 'SELECT opens_at, closes_at, timezone FROM exam_proctor_windows ORDER BY id DESC LIMIT 1';
    $result = $mysqli->query($sql);
    if ($result) {
        $row = $result->fetch_assoc();
        $result->free();
        if ($row) {
            $tz_candidate = isset($row['timezone']) && $row['timezone'] !== '' ? $row['timezone'] : $tz_name;
            $timezone = new DateTimeZone($tz_candidate);
            $open_candidate = parse_datetime_with_timezone($row['opens_at'], $timezone);
            $close_candidate = parse_datetime_with_timezone($row['closes_at'], $timezone);
            if ($open_candidate instanceof DateTime) {
                $open_dt = $open_candidate;
            }
            if ($close_candidate instanceof DateTime) {
                $close_dt = $close_candidate;
            }
            $source = 'database';
        }
    }

    if (!($open_dt instanceof DateTime)) {
        $open_dt = new DateTime('now', $timezone);
    }
    if (!($close_dt instanceof DateTime)) {
        $close_dt = clone $open_dt;
        $close_dt->modify('+3 days');
    }

    if ($close_dt <= $open_dt) {
        $close_dt = clone $open_dt;
        $close_dt->modify('+3 days');
    }

    return array(
        'open' => $open_dt,
        'close' => $close_dt,
        'timezone' => $timezone,
        'source' => $source
    );
}

function format_registration_window_response($window)
{
    $timezone = $window['timezone'];
    if (!($timezone instanceof DateTimeZone)) {
        $timezone = new DateTimeZone('Asia/Bangkok');
    }
    $now = new DateTime('now', $timezone);
    $open_dt = $window['open'] instanceof DateTime ? clone $window['open'] : new DateTime('now', $timezone);
    $close_dt = $window['close'] instanceof DateTime ? clone $window['close'] : new DateTime('+3 days', $timezone);

    return array(
        'opens_at' => $open_dt->format(DateTime::ATOM),
        'closes_at' => $close_dt->format(DateTime::ATOM),
        'open_timestamp' => $open_dt->getTimestamp(),
        'close_timestamp' => $close_dt->getTimestamp(),
        'timezone' => $timezone->getName(),
        'server_time' => $now->format(DateTime::ATOM),
        'server_timestamp' => $now->getTimestamp(),
        'is_open' => ($now >= $open_dt) && ($now <= $close_dt),
        'is_before_open' => $now < $open_dt,
        'is_after_close' => $now > $close_dt,
        'source' => $window['source']
    );
}

// -----------------------------------------------------------------------------
// Bootstrap
// -----------------------------------------------------------------------------

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . $config['allow_origin']);
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-KEY, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

validate_api_key($config['api_key']);

$mysqli = new mysqli($config['db_host'], $config['db_user'], $config['db_pass'], $config['db_name']);

if ($mysqli->connect_error) {
    send_json(false, 500, 'Database connection failed: ' . $mysqli->connect_error);
}

$mysqli->set_charset($config['db_charset']);

$action = isset($_GET['action']) ? $_GET['action'] : 'register';

// Read request body for POST JSON
$request_body = file_get_contents('php://input');
$json_data = array();
if (!empty($request_body)) {
    $decoded = json_decode($request_body, true);
    if (is_array($decoded)) {
        $json_data = $decoded;
    }
}

// Helper to fetch value from JSON with fallback to GET
function payload_value($json, $key, $default = '')
{
    if (isset($json[$key])) {
        return $json[$key];
    }
    return isset($_GET[$key]) ? $_GET[$key] : $default;
}

$registration_window = load_registration_window($mysqli, $config);

// -----------------------------------------------------------------------------
// Action handlers
// -----------------------------------------------------------------------------

if ($action === 'window') {
    $window_payload = format_registration_window_response($registration_window);
    send_json(true, 200, 'Registration window', $window_payload);
}

if ($action === 'register') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        send_json(false, 405, 'Method Not Allowed: use POST');
    }

    $timezone = $registration_window['timezone'];
    $now_dt = new DateTime('now', $timezone);
    $open_dt = clone $registration_window['open'];
    $close_dt = clone $registration_window['close'];
    if ($now_dt < $open_dt) {
        send_json(false, 423, 'ระบบยังไม่เปิดให้ลงทะเบียน กรุณารอให้ถึงเวลาที่กำหนด');
    }
    if ($now_dt > $close_dt) {
        send_json(false, 423, 'ระบบปิดรับลงทะเบียนแล้ว');
    }

    $emp_code = trim((string) payload_value($json_data, 'emp_code'));
    $registration_timestamp = payload_value($json_data, 'registration_timestamp');
    $registration_datetime = payload_value($json_data, 'registration_datetime');

    if ($emp_code === '' || $registration_timestamp === '' || $registration_datetime === '') {
        send_json(false, 400, 'Missing required fields');
    }

    $confirmed_data = (bool) payload_value($json_data, 'confirmed_data');
    $confirmed_exam = (bool) payload_value($json_data, 'confirmed_exam');

    if (!$confirmed_data || !$confirmed_exam) {
        send_json(false, 422, 'กรุณายืนยันข้อมูลและการปฏิบัติหน้าที่ก่อนลงทะเบียน');
    }

    $exam_date = payload_value($json_data, 'exam_date', $config['exam_date']);
    $sequence_number = payload_value($json_data, 'sequence_number');
    if ($sequence_number === '') {
        $sequence_number = substr($emp_code, -3) . substr($registration_timestamp, -5);
    }

    $phone_number = trim((string) payload_value($json_data, 'phone_number', payload_value($json_data, 'phone', '')));
    $user_type_raw = payload_value($json_data, 'user_type', payload_value($json_data, 'USER_TYPE', 'employee'));
    $user_type = normalize_user_type($user_type_raw);
    $user_role_input = payload_value($json_data, 'user_role', payload_value($json_data, 'USER_ROLE', ''));
    $user_role_input = strtolower(trim((string) $user_role_input));
    if ($user_role_input === '') {
        $user_role_input = is_admin_role($user_type, $config['admin_roles']) ? 'admin' : 'user';
    }
    $user_role = strpos($user_role_input, 'admin') !== false ? 'admin' : 'user';
    $gender = payload_value($json_data, 'gender', derive_gender_from_prefix(payload_value($json_data, 'prefix_name', '')));
    $level_code = trim((string) payload_value($json_data, 'level_code', payload_value($json_data, 'LEVEL_CODE', '')));
    $allowed_levels = array('40', '50', '60', '70', '80', '90');

    if ($level_code !== '' && !in_array($level_code, $allowed_levels, true)) {
        send_json(false, 403, 'คุณสมบัติไม่ผ่านเกณฑ์: ไม่อยู่ในระดับการศึกษาที่กำหนด');
    }

    $fields = array(
        'prefix_name' => payload_value($json_data, 'prefix_name'),
        'first_name' => payload_value($json_data, 'first_name'),
        'last_name' => payload_value($json_data, 'last_name'),
        'full_name' => payload_value($json_data, 'full_name'),
        'full_name_eng' => payload_value($json_data, 'full_name_eng'),
        'position_name' => payload_value($json_data, 'position_name'),
        'level_name' => payload_value($json_data, 'level_name'),
        'level_code' => $level_code,
        'section_name' => payload_value($json_data, 'section_name'),
        'department_name' => payload_value($json_data, 'department_name')
    );

    // Prevent duplicate registration
    $dup_stmt = $mysqli->prepare('SELECT id FROM exam_proctor_registrations WHERE emp_code = ? LIMIT 1');
    if (!$dup_stmt) {
        send_json(false, 500, 'Database error: ' . $mysqli->error);
    }
    $dup_stmt->bind_param('s', $emp_code);
    $dup_stmt->execute();
    $dup_stmt->store_result();
    if ($dup_stmt->num_rows > 0) {
        $dup_stmt->close();

        $detail_sql = 'SELECT id, emp_code, prefix_name, first_name, last_name, full_name, full_name_eng, position_name, level_name, level_code, section_name, department_name, exam_date, registration_timestamp, registration_datetime, confirmed_data, confirmed_exam, status, sequence_number, phone_number, user_type, user_role, gender, created_at
                        FROM exam_proctor_registrations WHERE emp_code = ? LIMIT 1';
        $detail_stmt = $mysqli->prepare($detail_sql);
        if (!$detail_stmt) {
            send_json(false, 500, 'Database error: ' . $mysqli->error);
        }
        $detail_stmt->bind_param('s', $emp_code);
        $detail_stmt->execute();
        $existing = null;
        $detail_stmt->bind_result(
            $d_id,
            $d_emp_code,
            $d_prefix_name,
            $d_first_name,
            $d_last_name,
            $d_full_name,
            $d_full_name_eng,
            $d_position_name,
            $d_level_name,
            $d_level_code,
            $d_section_name,
            $d_department_name,
            $d_exam_date,
            $d_registration_timestamp,
            $d_registration_datetime,
            $d_confirmed_data,
            $d_confirmed_exam,
            $d_status,
            $d_sequence_number,
            $d_phone_number,
            $d_user_type,
            $d_user_role,
            $d_gender,
            $d_created_at
        );
        if ($detail_stmt->fetch()) {
            $existing = array(
                'id' => (int) $d_id,
                'emp_code' => $d_emp_code,
                'prefix_name' => $d_prefix_name,
                'first_name' => $d_first_name,
                'last_name' => $d_last_name,
                'full_name' => $d_full_name,
                'full_name_eng' => $d_full_name_eng,
                'position_name' => $d_position_name,
                'level_name' => $d_level_name,
                'level_code' => $d_level_code,
                'section_name' => $d_section_name,
                'department_name' => $d_department_name,
                'exam_date' => $d_exam_date,
                'registration_timestamp' => (int) $d_registration_timestamp,
                'registration_datetime' => $d_registration_datetime,
                'confirmed_data' => (bool) $d_confirmed_data,
                'confirmed_exam' => (bool) $d_confirmed_exam,
                'status' => $d_status,
                'sequence_number' => (int) $d_sequence_number,
                'phone_number' => $d_phone_number,
                'user_type' => $d_user_type,
                'user_role' => $d_user_role,
                'gender' => $d_gender,
                'created_at' => $d_created_at
            );
        }
        $detail_stmt->close();

        $queue_number = null;
        if ($existing) {
            $queue_stmt = $mysqli->prepare('SELECT COUNT(*) AS queue_number FROM exam_proctor_registrations WHERE exam_date = ? AND registration_timestamp <= ?');
            if ($queue_stmt) {
                $exam = $existing['exam_date'];
                $ts = (string) $existing['registration_timestamp'];
                $queue_stmt->bind_param('ss', $exam, $ts);
                $queue_stmt->execute();
                $queue_stmt->bind_result($queue_value);
                $queue_stmt->fetch();
                $queue_number = (int) $queue_value;
                $queue_stmt->close();
            }
        }

        send_json(false, 409, 'Already registered', array(
            'registration' => $existing,
            'queue_number' => $queue_number
        ));
    }
    $dup_stmt->close();

    $capacity = get_registration_capacity($config);
    $capacity_limit = isset($capacity['total']) ? (int) $capacity['total'] : 0;
    if ($capacity_limit > 0) {
        $capacity_sql = "SELECT COUNT(*) AS total FROM exam_proctor_registrations WHERE user_role IS NULL OR user_role <> 'admin'";
        $capacity_result = $mysqli->query($capacity_sql);
        if ($capacity_result) {
            $capacity_row = $capacity_result->fetch_assoc();
            $capacity_result->free();
            if ($capacity_row && isset($capacity_row['total']) && (int) $capacity_row['total'] >= $capacity_limit) {
                send_json(false, 423, 'ระบบปิดรับลงทะเบียนแล้วเนื่องจากมีผู้สมัครครบจำนวนที่กำหนด');
            }
        }
    }

    $mysqli->autocommit(false);

    $insert_sql = 'INSERT INTO exam_proctor_registrations (
        emp_code,
        prefix_name,
        first_name,
        last_name,
        full_name,
        full_name_eng,
        position_name,
        level_name,
        level_code,
        section_name,
        department_name,
        exam_date,
        registration_timestamp,
        registration_datetime,
        confirmed_data,
        confirmed_exam,
        status,
        sequence_number,
        phone_number,
        user_type,
        user_role,
        gender
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';

    $status = payload_value($json_data, 'status', 'registered');

    $stmt = $mysqli->prepare($insert_sql);
    if (!$stmt) {
        $mysqli->rollback();
        send_json(false, 500, 'Database error: ' . $mysqli->error);
    }

    $registration_datetime_mysql = substr($registration_datetime, 0, 23);

    $reg_timestamp_str = (string) $registration_timestamp;
    $confirmedDataInt = $confirmed_data ? 1 : 0;
    $confirmedExamInt = $confirmed_exam ? 1 : 0;
    $sequence_number_str = (string) $sequence_number;
    $stmt->bind_param(
        'ssssssssssssssii' . 'ssssss',
        $emp_code,
        $fields['prefix_name'],
        $fields['first_name'],
        $fields['last_name'],
        $fields['full_name'],
        $fields['full_name_eng'],
        $fields['position_name'],
        $fields['level_name'],
        $fields['level_code'],
        $fields['section_name'],
        $fields['department_name'],
        $exam_date,
        $reg_timestamp_str,
        $registration_datetime_mysql,
        $confirmedDataInt,
        $confirmedExamInt,
        $status,
        $sequence_number_str,
        $phone_number,
        $user_type,
        $user_role,
        $gender
    );

    if (!$stmt->execute()) {
        $stmt->close();
        $mysqli->rollback();
        send_json(false, 500, 'Database insert failed: ' . $stmt->error);
    }

    $registration_id = $stmt->insert_id;
    $stmt->close();

    $queue_stmt = $mysqli->prepare('SELECT COUNT(*) AS queue_number FROM exam_proctor_registrations WHERE exam_date = ? AND registration_timestamp <= ?');
    if (!$queue_stmt) {
        $mysqli->rollback();
        send_json(false, 500, 'Database error: ' . $mysqli->error);
    }
    $queue_stmt->bind_param('ss', $exam_date, $reg_timestamp_str);
    $queue_stmt->execute();
    $queue_stmt->bind_result($queue_number);
    $queue_stmt->fetch();
    $queue_stmt->close();

    $mysqli->commit();

    send_json(true, 201, 'Registration successful', array(
        'registration_id' => (int) $registration_id,
        'queue_number' => (int) $queue_number,
        'sequence_number' => $sequence_number,
        'phone_number' => $phone_number,
        'user_type' => $user_type,
        'user_role' => $user_role,
        'level_name' => $fields['level_name'],
        'level_code' => $fields['level_code'],
        'gender' => $gender
    ));
}

if ($action === 'public_total') {
    $count = 0;
    $result = $mysqli->query("SELECT COUNT(*) AS total FROM exam_proctor_registrations WHERE user_role IS NULL OR user_role <> 'admin'");
    if ($result) {
        $row = $result->fetch_assoc();
        if ($row && isset($row['total'])) {
            $count = (int) $row['total'];
        }
        $result->free();
    }

    $capacity = get_registration_capacity($config);
    $capacity_total = isset($capacity['total']) ? (int) $capacity['total'] : 0;
    $is_full = $capacity_total > 0 && $count >= $capacity_total;

    send_json(true, 200, 'Registration total fetched', array(
        'total' => $count,
        'capacity' => $capacity,
        'is_full' => $is_full
    ));
}

if ($action === 'list') {
    $user_type = strtolower(trim((string) payload_value($json_data, 'user_type', payload_value($_GET, 'user_type', 'employee'))));
    $user_role_param = strtolower(trim((string) payload_value($json_data, 'user_role', payload_value($_GET, 'user_role', ''))));
    $emp_code_param = trim((string) payload_value($json_data, 'emp_code', payload_value($_GET, 'emp_code', '')));
    $hasAdminRole = strpos($user_role_param, 'admin') !== false
    || strpos($user_role_param, 'ผู้ดูแล') !== false
    || is_admin_role($user_type, $config['admin_roles'])
    || ($emp_code_param !== '' && in_array($emp_code_param, $config['admin_emp_codes'], true));
    if (!$hasAdminRole) {
        send_json(false, 403, 'Access denied: admin only');
    }

    $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 200;
    if ($limit < 1 || $limit > 1000) {
        $limit = 200;
    }

    $sql = 'SELECT id, emp_code, prefix_name, first_name, last_name, full_name, full_name_eng, position_name, level_name, level_code, section_name, department_name, exam_date, registration_timestamp, registration_datetime, confirmed_data, confirmed_exam, status, sequence_number, phone_number, user_type, user_role, gender, created_at
            FROM exam_proctor_registrations
            ORDER BY registration_timestamp ASC
            LIMIT ' . $limit;

    $result = $mysqli->query($sql);
    if (!$result) {
        send_json(false, 500, 'Database error: ' . $mysqli->error);
    }

    $rows = array();
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    $result->free();

    send_json(true, 200, 'Registration list fetched', array(
        'items' => $rows,
        'total' => count($rows)
    ));
}

if ($action === 'stats') {
    $user_type = strtolower(trim((string) payload_value($json_data, 'user_type', payload_value($_GET, 'user_type', 'employee'))));
    $user_role_param = strtolower(trim((string) payload_value($json_data, 'user_role', payload_value($_GET, 'user_role', ''))));
    $emp_code_param = trim((string) payload_value($json_data, 'emp_code', payload_value($_GET, 'emp_code', '')));
    $hasAdminRole = strpos($user_role_param, 'admin') !== false
        || strpos($user_role_param, 'ผู้ดูแล') !== false
        || is_admin_role($user_type, $config['admin_roles'])
        || ($emp_code_param !== '' && in_array($emp_code_param, $config['admin_emp_codes'], true));
    if (!$hasAdminRole) {
        send_json(false, 403, 'Access denied: admin only');
    }

    $stats = array(
        'total' => 0,
        'by_user_type' => array(),
        'by_user_role' => array(),
        'by_department' => array(),
        'by_level' => array(),
        'by_gender' => array()
    );

    $count_result = $mysqli->query("SELECT COUNT(*) AS total FROM exam_proctor_registrations WHERE user_role IS NULL OR user_role <> 'admin'");
    if ($count_result) {
        $row = $count_result->fetch_assoc();
        $stats['total'] = isset($row['total']) ? (int) $row['total'] : 0;
        $count_result->free();
    }

    $group_queries = array(
        'by_user_type' => 'SELECT user_type AS label, COUNT(*) AS count FROM exam_proctor_registrations GROUP BY user_type',
        'by_user_role' => 'SELECT user_role AS label, COUNT(*) AS count FROM exam_proctor_registrations GROUP BY user_role',
        'by_department' => 'SELECT department_name AS label, COUNT(*) AS count FROM exam_proctor_registrations GROUP BY department_name',
        'by_level' => 'SELECT level_name AS label, COUNT(*) AS count FROM exam_proctor_registrations GROUP BY level_name',
        'by_gender' => 'SELECT gender AS label, COUNT(*) AS count FROM exam_proctor_registrations GROUP BY gender'
    );

    foreach ($group_queries as $key => $sql) {
        $result = $mysqli->query($sql);
        if ($result) {
            $items = array();
            while ($row = $result->fetch_assoc()) {
                $items[] = array(
                    'label' => $row['label'] === null || $row['label'] === '' ? 'ไม่ระบุ' : $row['label'],
                    'count' => (int) $row['count']
                );
            }
            $result->free();

            usort($items, function ($a, $b) {
                if ($a['count'] === $b['count']) {
                    return strcmp($a['label'], $b['label']);
                }
                return $a['count'] > $b['count'] ? -1 : 1;
            });

            $stats[$key] = $items;
        }
    }

    send_json(true, 200, 'Statistics fetched', $stats);
}

if ($action === 'detail') {
    $emp_code = trim((string) payload_value($json_data, 'emp_code', payload_value($_GET, 'emp_code', '')));
    if ($emp_code === '') {
        send_json(false, 400, 'Missing emp_code');
    }

    $detail_sql = 'SELECT id, emp_code, prefix_name, first_name, last_name, full_name, full_name_eng, position_name, level_name, level_code, section_name, department_name, exam_date, registration_timestamp, registration_datetime, confirmed_data, confirmed_exam, status, sequence_number, phone_number, user_type, user_role, gender, created_at
                    FROM exam_proctor_registrations WHERE emp_code = ? LIMIT 1';

    $detail_stmt = $mysqli->prepare($detail_sql);
    if (!$detail_stmt) {
        send_json(false, 500, 'Database error: ' . $mysqli->error);
    }

    $detail_stmt->bind_param('s', $emp_code);
    $detail_stmt->execute();
    $detail_stmt->bind_result(
        $d_id,
        $d_emp_code,
        $d_prefix_name,
        $d_first_name,
        $d_last_name,
        $d_full_name,
        $d_full_name_eng,
        $d_position_name,
        $d_level_name,
        $d_level_code,
        $d_section_name,
        $d_department_name,
        $d_exam_date,
        $d_registration_timestamp,
        $d_registration_datetime,
        $d_confirmed_data,
        $d_confirmed_exam,
        $d_status,
        $d_sequence_number,
        $d_phone_number,
        $d_user_type,
        $d_user_role,
        $d_gender,
        $d_created_at
    );

    $existing = null;
    if ($detail_stmt->fetch()) {
        $existing = array(
            'id' => (int) $d_id,
            'emp_code' => $d_emp_code,
            'prefix_name' => $d_prefix_name,
            'first_name' => $d_first_name,
            'last_name' => $d_last_name,
            'full_name' => $d_full_name,
            'full_name_eng' => $d_full_name_eng,
            'position_name' => $d_position_name,
            'level_name' => $d_level_name,
            'level_code' => $d_level_code,
            'section_name' => $d_section_name,
            'department_name' => $d_department_name,
            'exam_date' => $d_exam_date,
            'registration_timestamp' => (int) $d_registration_timestamp,
            'registration_datetime' => $d_registration_datetime,
            'confirmed_data' => (bool) $d_confirmed_data,
            'confirmed_exam' => (bool) $d_confirmed_exam,
            'status' => $d_status,
            'sequence_number' => (int) $d_sequence_number,
            'phone_number' => $d_phone_number,
            'user_type' => $d_user_type,
            'user_role' => $d_user_role,
            'gender' => $d_gender,
            'created_at' => $d_created_at
        );
    }
    $detail_stmt->close();

    if (!$existing) {
        send_json(false, 404, 'ยังไม่มีข้อมูลการลงทะเบียนของผู้ใช้งานนี้');
    }

    $queue_number = null;
    $queue_stmt = $mysqli->prepare('SELECT COUNT(*) AS queue_number FROM exam_proctor_registrations WHERE exam_date = ? AND registration_timestamp <= ?');
    if ($queue_stmt) {
        $exam = $existing['exam_date'];
        $ts = (string) $existing['registration_timestamp'];
        $queue_stmt->bind_param('ss', $exam, $ts);
        $queue_stmt->execute();
        $queue_stmt->bind_result($queue_value);
        if ($queue_stmt->fetch()) {
            $queue_number = (int) $queue_value;
        }
        $queue_stmt->close();
    }

    send_json(true, 200, 'Registration detail', array(
        'registration' => $existing,
        'queue_number' => $queue_number
    ));
}

send_json(false, 400, 'Unknown action');


