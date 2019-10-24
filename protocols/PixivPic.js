const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v4');

if (!fs.existsSync(path.join(secret.tempPath, 'setu')))
    fs.mkdirSync(path.join(secret.tempPath, 'setu'));

let isInitialized = false;

appEvent.on('browser_initialized', async () => {
    await pullRanking();

    const setuLinkInit = [];
    for (let i = 0; i < 5; i++) {
        setuLinkInit[i] = setuPush();
    }
    await Promise.all(setuLinkInit);

    isInitialized = true;
});


setInterval(() => {
    // 清理过期色图
    const setuDir = fs.readdirSync(path.join(secret.tempPath, 'setu'));
    for (let i = setuDir.length - 1; i >= 0; i--) {
        const setuPath = setuDir[i];
        for (const link of setuLink) {
            if (path.basename(link) == setuPath) {
                setuDir.splice(i, 1);
                break;
            }
        }
    }
    for (const setuPath of setuDir) {
        fs.unlinkSync(path.join(secret.tempPath, 'setu', setuPath));
    }

    // 每天6点更新排行
    if (new Date().getHours() == 6) {
        pullRanking();
    }
}, 3600000);

let setuPool = [];

async function pullRanking() {
    const page = await browser.newPage();

    const cookies = secret.PixivCookies.split(';');
    for (let i = 0; i < cookies.length; i++) {
        const name = cookies[i].split('=')[0].trim();
        const value = cookies[i].split('=')[1].trim();
        cookies[i] = {
            name,
            value,
            domain: '.pixiv.net'
        }
    }
    await page.setCookie(...cookies);

    try {
        page.goto('https://www.pixiv.net/ranking.php?mode=male', {
            waitUntil: 'networkidle2'
        });

        await page.waitForFunction(() => {
            const items = document.querySelectorAll('.ranking-item');
            if (items) {
                if (items.length < 500) {
                    window.scrollBy(0, document.documentElement.scrollHeight);
                    return false;
                } else {
                    return true
                }
            }
            return false;
        });
    } catch {
        await page.close();
        return;
    }

    const results = await page.evaluate(() => {
        window.stop();
        const items = document.querySelectorAll('.ranking-item');
        const retArr = [];
        if (items) {
            for (const item of items) {
                const imageItem = item.querySelector('.ranking-image-item .work');
                if (!/manga/i.test(imageItem.getAttribute('class'))) {
                    const tags = imageItem.querySelector('img').getAttribute('data-tags');
                    // 这才是真正的色图
                    if (/着|乳|魅惑|タイツ|スト|足|尻|縛|束|users/i.test(tags)) {
                        retArr.push({
                            title: item.getAttribute('data-title'),
                            url: imageItem.getAttribute('href')
                        });
                    }
                }
            }
            return retArr;
        }
        return null;
    });
    await page.close();

    if (results) {
        setuPool = results;
        console.log('已拉取色图库');
    } else {
        console.error('色图库拉取失败');
    }
}

const setuLink = [];

async function setuPush() {
    if (setuPool.length == 0) return;

    const page = await browser.newPage();

    const responses = [];
    page.on('response', res => {
        responses.push(res);
    });

    const setuIndex = parseInt(Math.random() * setuPool.length);

    try {
        await page.goto(`https://pixiv.net${setuPool[setuIndex].url}`, {
            waitUntil: 'networkidle2'
        });
    } catch {
        // 发生错误啥都不做
        await page.close();
        return;
    }

    const setuUrl = await page.evaluate(title => {
        const imgs = document.querySelectorAll('img');
        for (const img of imgs) {
            const alt = img.getAttribute('alt');
            if (alt && new RegExp(title).test(alt)) {
                return img.getAttribute('src');
            }
        }
    }, setuPool[setuIndex].title);
    await page.close();

    for (const res of responses) {
        if (res.url() == setuUrl) {
            const setuPath = path.join(secret.tempPath, 'setu', path.basename(res.url()));
            fs.writeFileSync(setuPath, await res.buffer());
            setuLink.push(setuPath);
            setuPool.splice(setuIndex, 1);
            break;
        }
    }
}

module.exports = function (recvObj, client) {
    if (/(色|涩|瑟).*图|gkd|搞快点/im.test(recvObj.params.content)) {
        PixivPic(recvObj, client);
        return true;
    }
    return false;
}

async function PixivPic(recvObj, client) {
    if (!isInitialized) {
        client.sendObj({
            id: uuid(),
            method: "sendMessage",
            params: {
                type: recvObj.params.type,
                group: recvObj.params.group || '',
                qq: recvObj.params.qq || '',
                content: '萨塔尼亚还没准备好~'
            }
        });
        return;
    }

    if (setuLink.length == 0) {
        client.sendObj({
            id: uuid(),
            method: "sendMessage",
            params: {
                type: recvObj.params.type,
                group: recvObj.params.group || '',
                qq: recvObj.params.qq || '',
                content: `[QQ:pic=https://sub1.gameoldboy.com/satania_cry.gif]`
            }
        });
    } else {
        client.sendObj({
            id: uuid(),
            method: "sendMessage",
            params: {
                type: recvObj.params.type,
                group: recvObj.params.group || '',
                qq: recvObj.params.qq || '',
                content: `[QQ:pic=${setuLink.shift()}]`
            }
        });
        setuPush();
    }
}