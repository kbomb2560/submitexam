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
    'admin_roles' => array('admin', 'administrator'),
    'admin_emp_codes' => array('653004')
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

// -----------------------------------------------------------------------------
// Action handlers
// -----------------------------------------------------------------------------

if ($action === 'register') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        send_json(false, 405, 'Method Not Allowed: use POST');
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

    $count_result = $mysqli->query('SELECT COUNT(*) AS total FROM exam_proctor_registrations');
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


