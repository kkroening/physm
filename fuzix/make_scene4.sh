#!/usr/bin/env bash
ffmpeg -ss 00:00:08 -to 47 -i ~/tmp/scene4.mov -r 60 -filter:v "setpts=0.7*PTS"  scene_04_editor.mp4 -y
ffmpeg -i anims/scene_04.mp4 -filter:v 'scale=1008:1244:force_original_aspect_ratio=1,pad=1008:1244:(ow-iw)/2:(oh-ih)/2:white' scene_04_render.mp4 -y
ffmpeg -i scene_04_editor.mp4 -i scene_04_render.mp4 -filter_complex '[0][1]concat=n=2[2]' -map '[2]' scene_04_full.mp4
