# p5 Phone Simple Start

A starting point for writing p5.js sketches on your laptop and opening them on your phone.

It is the same setup you have used in the p5 web editor:

- `index.html` links p5.js 2.x and p5-phone.
- `sketch.js` is your sketch.

It also includes one extra file, `.github/workflows/static.yml`. That file tells GitHub to publish your sketch as a web page every time you push.

## Use it

The full walkthrough with screenshots is here:
https://digitalfuturesocadu.github.io/vsCodeSetup/guide/

The short version:

1. Click **Use this template**, then **Create a new repository**. Keep it **Public**.
2. In your new repository, open **Settings**, then **Pages**. Set **Source** to **GitHub Actions**.
3. In VS Code, choose **Clone Git Repository**, then **Clone from GitHub**, and pick your new repository.
4. Open `index.html` and click **Go Live** to see the sketch on your laptop.
5. Change `sketch.js`. In Source Control, write a message, click **Commit**, then **Sync Changes**.
6. Wait about a minute. Open this address on your phone:

```
https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/
```

## What is in the sketch

Nothing yet. `sketch.js` is the same blank sketch you get in the p5 web editor: a `setup()` that makes a 400 by 400 canvas and a `draw()` that fills it with grey. Start from there.

p5-phone is already linked in `index.html`, so its functions are ready when you want your phone's sensors.
