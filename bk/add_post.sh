#!/bin/bash

if [ -z "$1" ]; then
    echo "用法: $0 <md文件路径> [标题]"
    exit 1
fi

MD_FILE="$1"
TITLE="${2:-$(basename "$MD_FILE" .md)}"
SLUG=$(basename "$MD_FILE" .md | tr ' ' '-' | tr -cd 'a-zA-Z0-9_-')

if [ -z "$SLUG" ]; then
    SLUG="post-$(date +%s)"
fi

DATE=$(date +%Y-%m-%d)

if [ ! -f "$MD_FILE" ]; then
    echo "错误: 文件 $MD_FILE 不存在"
    exit 1
fi

cp "$MD_FILE" "posts/${SLUG}.md"

POST_ENTRY="{ slug: '$SLUG', title: '$TITLE', date: '$DATE' },"

if grep -q "const posts = \[" posts.js; then
    sed -i "/const posts = \[/a\\    $POST_ENTRY" posts.js
else
    echo "错误: posts.js 格式不正确"
    exit 1
fi

echo "文章添加成功!"
echo "标题: $TITLE"
echo " slug: $SLUG"
echo " 日期: $DATE"
echo ""
echo "请确保 posts/${SLUG}.md 文件存在"