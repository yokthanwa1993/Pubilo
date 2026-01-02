<?php
$servername = "localhost";
$username = "postn_tdev2024";
$password = "4ce2qW3~5";
$dbname = "postn_hidepost";

$tokens = [
	
"EAAChZCKmUTDcBQWpiSSxkZAucIFmJC5lsCTBc8K1dIzwJvf2ZAfSdIXITrbzFoRzhHfpSdh04REN1QJah8gShZC7caeEe0YV8UZCbMDTZCxbDXsVs3a5mhBUSAh0GVvnN5SGZAdMNeF19TPxfdZAQZBnyxNdgArDDN9Mr2teh324gvZAldfmrsNuMXG4QhSacjgitcTfLZBPQmZC4L9ZCEz50GhsZD",
];

// Create connection
$conn = new mysqli($servername, $username, $password, $dbname);

date_default_timezone_set("Asia/Bangkok");

function getRandomToken() {
    global $tokens;
    return $tokens[array_rand($tokens)];
}

function searchForKey($value, $array) {
    foreach ($array as $key => $val) {
        if ($val['minute_set'] - 21 > $value) {
            return $key;
        }
    }
    return -1;
}

function one_query($query,$conn) {
    $queryx  = $query;
    $result = mysqli_query($conn, $queryx);
    $row = mysqli_fetch_assoc($result);
    return $row;
}

function multi_query($query,$conn) {
    if ($conn->multi_query($query) === TRUE) {
        echo "New records created successfully";
    } else {
        echo "Error: " . $query . "<br>" . $conn->error;
    }
}

function in_array_r($needle, $haystack, $strict = false) {
    foreach ($haystack as $item) {
        if (($strict ? $item === $needle : $item == $needle) || (is_array($item) && in_array_r($needle, $item, $strict))) {
            return true;
        }
    }
    return false;
}

function arr_query($query,$conn) {
    $queryx = $query;
    $array = [];
    if ($result = $conn->query($queryx)) {
        while ($row = $result->fetch_assoc()) {
            $array[] = $row;
        }
    }
    return $array;
}

function curl_http($url) {
    $curl = curl_init();
    curl_setopt_array($curl, array(
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_MAXREDIRS => 10,
        CURLOPT_TIMEOUT => 0,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_CUSTOMREQUEST => 'GET',
    ));
    $response = curl_exec($curl);
    curl_close($curl);
    return $response;
}

function arr_query_w_arr($query,$conn) {
    $array = [];
    if ($result = $conn->query($query)) {
        while ($row = $result->fetch_assoc()) {
            $array[] = $row;
        }
    }
    $page_me = array_column($array, 'post_id');
    return $page_me;
}

function notify_message($message,$token){
    define('LINE_API',"https://notify-api.line.me/api/notify");
    define('LINE_TOKEN',$token);
    $queryData = array('message' => $message);
    $queryData = http_build_query($queryData,'','&');
    $headerOptions = array(
        'http'=>array(
            'method'=>'POST',
            'header'=> "Content-Type: application/x-www-form-urlencoded\r\n"
                    ."Authorization: Bearer ".LINE_TOKEN."\r\n"
                    ."Content-Length: ".strlen($queryData)."\r\n",
            'content' => $queryData
        )
    );
    $context = stream_context_create($headerOptions);
    $result = file_get_contents(LINE_API,FALSE,$context);
    $res = json_decode($result,true);
    return $res;
}
?>
