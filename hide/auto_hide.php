<?php
include 'config.php';

$ck = date("i");

$dup_post = arr_query("SELECT post_id FROM post_history WHERE status = 0 LIMIT 30",$conn);

$q_for = "";

foreach($dup_post as $key => $v) {
    print_r($v);
    $url = "https://graph.facebook.com/v19.0/".$v["post_id"]."?method=POST&timeline_visibility=hidden&access_token=" . getRandomToken();

    echo $url."<br>";
    $hide_exec = json_decode(file_get_contents($url), true);
    print_r($hide_exec);
    $q_for .= "UPDATE post_history SET status = 1 WHERE post_id = '{$v["post_id"]}';";
}

if($q_for != "") {
    $mul = multi_query($q_for,$conn);
}
?>
