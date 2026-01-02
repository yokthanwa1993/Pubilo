<?php
include 'config.php';

$url = "https://graph.facebook.com/v19.0/me/posts?fields=status_type&limit=100&access_token=".getRandomToken();
$get_post = json_decode(file_get_contents($url), true);

$dup_post = arr_query("SELECT post_id FROM post_history",$conn);

$q_for = "";



print_r($dup_post);


foreach($get_post["data"] as $key => $v) {
    if(in_array_r($v["id"],$dup_post))  {
        echo "dup <br>";
        continue;
    }

    if(($v["status_type"] == "shared_story") || ($v["status_type"] == "mobile_status_update") || ($v["status_type"] == "added_photos")) {
        echo $v["id"]."<br>";
        $urlx = "https://graph.facebook.com/v19.0/".$v["id"]."?method=POST&timeline_visibility=hidden&access_token=" . getRandomToken();
        $hide_exec = json_decode(file_get_contents($urlx), true);
        $q_for .= "INSERT post_history (post_id) VALUES ('{$v["id"]}');";
    }
}
if($q_for != "") {
    $mul = multi_query($q_for,$conn);
}

?>
