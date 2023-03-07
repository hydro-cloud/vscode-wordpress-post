import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import axios from "axios";
// import MarkdownIt = require("markdown-it");
import * as matter from "gray-matter";
import * as cheerio from "cheerio";
import { Context } from "./context";

// prismの設定項目
// https://prismjs.com/download.html#themes=prism-tomorrow&languages=markup+css+clike+javascript+arduino+aspnet+c+csharp+cpp+css-extras+csv+dart+diff+docker+git+http+icon+ignore+java+javadoclike+javastacktrace+jsdoc+json+markdown+markup-templating+mermaid+nginx+objectivec+php+plant-uml+powershell+python+sql+swift+typescript+uri+yaml&plugins=line-highlight+line-numbers+show-invisibles+show-language+highlight-keywords+inline-color+toolbar+copy-to-clipboard+diff-highlight+treeview
// markdown-it プラグイン検索
// https://www.npmjs.com/search?q=keywords%3Amarkdown-it-plugin%20
const md = require('markdown-it')({
  // 設定の日本語訳はこちらが詳しい: https://techblog.roxx.co.jp/entry/2019/01/24/190000
  html: true, // 文中のコメントアウトにも必要
  linkify: false,
})
  .use(require('markdown-it-emoji')) // 絵文字を出す
  // .use(require('markdown-it-prism'))　// markdown-it-containerと被るので不使用
  // .use(require('markvis')) // グラフ表示 エラーになるので使わない
  .use(require("markdown-it-expandable")) // +++:open , >>>:close(これは別の意味なので使用不可)  でexpand 
  .use(require("markdown-it-footnote")) // 注釈をつかう
  .use(require("markdown-it-mark")) // ==ハイライト==
  // ::: コンテナを利用した独自レイアウト
  .use(require('markdown-it-container'), 'detail', {

    validate: function (params: any) {
      return params.trim().match(/^detail\s+(.*)$/);
    },

    render: function (tokens: any, idx: any) {
      var m = tokens[idx].info.trim().match(/^detail\s+(.*)$/);

      if (tokens[idx].nesting === 1) {
        // <details open> で初期がOpen
        return '<details ><summary>' + md.utils.escapeHtml(m[1]) + '</summary>\n';

      } else {
        return '</details>\n';
      }
    }
  })
  .use(require('markdown-it-container'), 'note', {

    validate: function (params: any) {
      return params.trim().match(/^note\s+(.*)$/);
    },

    render: function (tokens: any, idx: any) {
      var m = tokens[idx].info.trim().match(/^note\s+(.*)$/);

      if (tokens[idx].nesting === 1) {
        return '<div class="note ' + md.utils.escapeHtml(m[1]) + '"><div class="note-body">';

      } else {
        return '</div></div>\n';
      }
    }
  })
  // cocoon: 付箋風ボックス
  .use(require('markdown-it-container'), 'sticky', {

    validate: function (params: any) {
      return params.trim().match(/^sticky\s+(.*)$/);
    },

    render: function (tokens: any, idx: any) {
      var m = tokens[idx].info.trim().match(/^sticky\s+(.*)$/);

      if (tokens[idx].nesting === 1) {
        return '<div class="wp-block-cocoon-blocks-sticky-box blank-box block-box sticky ' + md.utils.escapeHtml(m[1]) + '">';

      } else {
        return '</div>\n';
      }
    }
  })
  // cocoon: ラベルボックス
  .use(require('markdown-it-container'), 'label', {

    validate: function (params: any) {
      return params.trim().match(/^label\s+(.*)$/);
    },

    render: function (tokens: any, idx: any) {
      var m = tokens[idx].info.trim().match(/^label\s+(.*)$/);

      if (tokens[idx].nesting === 1) {
        return `<div class="wp-block-cocoon-blocks-label-box-1 label-box block-box"><div class="label-box-label block-box-label box-label"><span class="label-box-label-text block-box-label-text box-label-text">${md.utils.escapeHtml(m[1])}</span></div><div class="label-box-content block-box-content box-content">`;

      } else {
        return '</div>\n';
      }
    }
  })

  // cocoon: speech-balloon
  .use(require('markdown-it-container'), 'speech', {

    validate: function (params: any) {
      return params.trim().match(/^speech\s+(.*)$/);
    },

    render: function (tokens: any, idx: any) {
      var m = tokens[idx].info.trim().match(/^speech\s+(.*)$/);

      if (tokens[idx].nesting === 1) {
        let val = {
          name: "",
          image: "",
          opposite: false
        };
        if (m[1]) val = JSON.parse((m[1]));
        //
        let position = val.opposite ? "sbp-r" : "sbp-l";

        let elm = `<div class="wp-block-cocoon-blocks-balloon-ex-box-1 speech-wrap sb-id-1 sbs-stn ${position} sbis-cb cf block-box">`;
        elm += `<div class="speech-person">`
        elm += `<figure class="speech-icon">`
        elm += `<img src="${val.image}" alt="${val.name}" class="speech-icon-image"/>`;
        elm += `</figure>`
        elm += `<div class="speech-name">${val.name}</div>`
        elm += `</div>`
        elm += `<div class="speech-balloon">`
        return elm;

      } else {
        return '</div></div>\n';

      }
    }
  })
// WP Mermaidに対応しない
//  .use(require('markdown-it-textual-uml'))
//  .use(require('markdown-it-mermaid'));

const REG_WWWIMG = new RegExp("^(http|https):.+");

/**
 * Post to wordpress from current document.
 */
export const post = async (context: Context) => {
  // start
  context.debug(`[00S] post start`);

  // current document
  context.debug(`[01S] get document`);
  const doc = getCurrentDocument();
  context.debug(`[01E] got document`);

  // document path
  context.debug(`[02S] detect document path`);
  const docPath = doc.fileName;
  const docParsedPath = path.parse(docPath);
  context.debug(`[02E] detected document path: ${docPath}`);

  // check document file extension
  context.debug(`[03S] check file extension`);
  if (docParsedPath.ext !== ".md") {
    const msg = `Not a Markdow file: ${docParsedPath.base}`;
    context.debug(`[03Z] ${msg}`);
    throw new Error(msg);
  }
  context.debug(`[03E] check file extension : ok`);

  // post data
  const postData: { [key: string]: any } = {};

  // text -> frontmatter(markdown.data) and markdown(markdown.content)
  context.debug(`[05S] parse document`);
  const markdown = matter(doc.getText());
  context.debug(`[05E] parsed document`);

  // frontmatter -> post data attributes
  context.debug(`[05S] parse frontmatter`);
  const slugKeys = context.getSlugKeys();
  for (const key in markdown.data) {
    if (slugKeys.indexOf(key) > -1) {
      // slug -> id by http request
      const slugs: string[] = markdown.data[key];
      const items = await Promise.all(
        slugs.map((slug) => getWpItem(context, key, { slug: slug }))
      );
      postData[key] = items.map((item) => item["id"]);
    } else {
      postData[key] = markdown.data[key];
    }
    context.debug(`[05I] frontmatter ${key} : ${postData[key]}`);
  }
  context.debug(`[05E] parse frontmatter`);

  // document slug
  context.debug(`[04S] detect document slug`);
  if (!postData["slug"]) {
    postData["slug"] = docParsedPath.name;
  }
  context.debug(`[04E] detected document slug : ${postData["slug"]}`);

  // markdown -> post data content
  context.debug(`[06S] convert to html`);
  // postData["content"] = MarkdownIt().render(markdown.content);
  postData["content"] = md.render(markdown.content);

  context.debug(`[06E] converted to html`);

  console.log('MarkdownIt', postData.content)


  // upload attached image file, change src
  context.debug(`[07S] process attached images`);
  const ch = cheerio.load(postData["content"]);
  const imgs = ch("img");
  for (let i = 0; i < imgs.length; i++) {
    // src attr
    let srcAttr = ch(imgs[i]).attr("src");
    if (!srcAttr) {
      context.debug(`[07I] skip image tag`);
      continue;
    }

    // save src attr to use useLinkableImage
    let linkUri = srcAttr;

    // add title attribute
    if (context.imageAddTitleAttribute()) {
      if (!ch(imgs[i]).attr("title")) {
        ch(imgs[i]).attr("title", ch(imgs[i]).attr("alt"));
      }
    }

    // Get image size information 
    const [orgImgWidth, orgImgHeight] = await getImageSize(docParsedPath.dir, srcAttr);
    const [maxImgWidth, maxImgHeight] = context.getImageMaxSize();
    const [displayImgWidth, displayImgHeight] = calculateImageSize(orgImgWidth, orgImgHeight, maxImgWidth, maxImgHeight);

    // replace src attr
    if (srcAttr.match(REG_WWWIMG)) {
      // www link -> as is
      // srcAttr = srcAttr
      context.debug(`[07I] www src: ${srcAttr}`);
      if (context.imageResize()) {
        ch(imgs[i]).attr("width", displayImgWidth.toString());
        ch(imgs[i]).attr("height", displayImgHeight.toString());
      } else {
        if (context.imageAddSizeAttributes()) {
          ch(imgs[i]).attr("width", orgImgWidth.toString());
          ch(imgs[i]).attr("height", orgImgHeight.toString());
        }
      }
    } else {
      // local(relative link) -> upload and replace src attr
      // upload 
      context.debug(`[07I] local src: ${srcAttr}`);
      const attachedImgPath = path.join(docParsedPath.dir, srcAttr);
      context.debug(`[07I] local path: ${attachedImgPath}`);
      const imgSlug = context.getAttachedImageSlug(
        path.parse(attachedImgPath).name,
        postData["slug"]
      );
      context.debug(`[07I] image slug: ${imgSlug}`);
      /*
      const imgItem = await uploadImage(context, imgSlug, attachedImgPath);

      // replace src
      srcAttr = context.replaceAttachedImageUrl(imgItem["source_url"]);
      linkUri = srcAttr;
      */

      context.debug(`[07I] final image src: ${srcAttr}`);

      // generate thumbnail image if needed.
      if (context.imageResize()) {
        if ((orgImgWidth !== displayImgWidth) || (orgImgHeight !== displayImgHeight)) {
          const size = displayImgWidth.toString() + "x" + displayImgHeight.toString();
          const thumbnail =
            path.join(
              path.parse(attachedImgPath).dir,
              path.parse(attachedImgPath).name + "-" + size + path.parse(attachedImgPath).ext
            );
          const thumbnailSlug = context.getAttachedImageThumbnailSlug(imgSlug, displayImgWidth, displayImgHeight);

          /* generate thumbnail */
          const sharp = require("sharp");
          try {
            let data = sharp(attachedImgPath).resize({
              width: displayImgWidth,
              height: displayImgHeight,
              fit: "fill"
            });

            // encode JPEG or PNG according to configuration
            const ext = path.parse(attachedImgPath).ext.toLowerCase();
            if ((ext === ".jpg") || (ext === ".jpeg")) {
              data = data.jpeg({
                quality: context.getImageResizeJpegQuality(),
                mozjpeg: context.useMozjpeg()
              });
            }
            if (ext === ".png") {
              data = data.png({
                palette: context.usePngPalette()
              });
            }
            data.toFile(thumbnail);
          }
          catch (err) {
            const msg = `Can't generate thumbnail file: ${attachedImgPath}`;
            context.debug(msg);
            throw new Error(msg);
          };

          /* upload thumbnail to wordpress */

          // const imgItem = await uploadImage(context, thumbnailSlug, thumbnail);
          const imgItem = await uploadImage(context, imgSlug, thumbnail);
          //
          srcAttr = context.replaceAttachedImageUrl(imgItem["source_url"]);
          linkUri = srcAttr;

          if (context.imageAddSizeAttributes()) {
            ch(imgs[i]).attr("width", displayImgWidth.toString());
            ch(imgs[i]).attr("height", displayImgHeight.toString());
          }
        }
      } else {
        const imgItem = await uploadImage(context, imgSlug, attachedImgPath);

        // replace src
        srcAttr = context.replaceAttachedImageUrl(imgItem["source_url"]);
        linkUri = srcAttr;

        if (context.imageAddSizeAttributes()) {
          ch(imgs[i]).attr("width", orgImgWidth.toString());
          ch(imgs[i]).attr("height", orgImgHeight.toString());
        }
      }
    }
    const newImgTag = ch.html(ch(imgs[i]).attr("src", srcAttr));
    if (context.useLinkableImage()) {
      context.debug(`[07I] use a tag`);
      ch(imgs[i]).replaceWith(`<a href="${linkUri}">${newImgTag}</a>`);
    } else {
      context.debug(`[07I] not use a tag`);
      ch(imgs[i]).replaceWith(`${newImgTag}`);
    }
  }
  context.debug(`[07E] processed attached images`);

  //
  const codes = ch("code");
  for (let i = 0; i < codes.length; i++) {
    // 
    let className = ch(codes[i]).attr("class");
    let text = ch(codes[i]).text();
    let parent = ch(codes[i]).parent()
    let parent_tagName = parent.get(0)?.tagName.toLowerCase();
    //
    if (className == null) continue;
    //
    let languages = className
      .replace("language-", "")
      .replace("diff-", "")
      .replace("diff_", "")
      .trim()
      .split(":");

    // console.log({ className })
    // console.log({ parent })
    // console.log({ languages })
    //
    let language = languages.length >= 1 ? languages[0] : null;
    let filePath = languages.length >= 2 ? languages[1] : null;

    // console.log({ language })
    // console.log({ filePath })
    if (parent_tagName === "pre") {
      // prism 
      if (!!language) ch(parent).attr("data-label", filePath);
      //
      if (!!language) ch(parent).attr("data-lang", language);
      if (!!filePath) ch(parent).attr("data-file", filePath);
    }


    if (className.startsWith("language-mermaid")) {
      // WP mermaid
      className = "mermaid";
    } else if (className.startsWith("language-diff")) {
      // diff
      className = "language-diff";
      className += " diff-highlight";
      // linenumbers
      if (true) className += " line-numbers";
    } else if (!!language) {
      className = `language-${language}`;
      // linenumbers
      if (true) className += " line-numbers";
    }


    //

    // ch(codes[i]).replaceWith(`<code class="${className}">${escapeHTML(text)}</code>`);
    ch(codes[i]).replaceWith(`<code class="${className}">${md.utils.escapeHtml(text)}</code>`);

  }



  // これはQiitaはJSでやっていた
  const as = ch("a");
  for (let i = 0; i < as.length; i++) {

    try {
      //
      let url = ch(as[i]).attr("href");
      if (url == null) continue;


      let element = ch(as[i]).get(0);
      let parentNode = ch(as[i]).parent().get(0);

      // console.log("parentNode.tagName",parentNode.tagName)
      // console.log("parentNode.childNodes.length",parentNode.childNodes.length)
      // console.log("element.nextSibling",element.nextSibling)
      // console.log("element.previousSibling",element.previousSibling)

      if (parentNode.tagName.toLowerCase() != "p") continue;
      if (parentNode.childNodes.length != 1) continue;
      if (element.nextSibling != null) continue;
      if (element.previousSibling != null) continue;


      const res = await axios({
        url: url,
        method: `GET`,
      });

      // console.log({url})
      // console.log({res})

      const ch2 = cheerio.load(res.data);
      const image = ch2("meta[property='og:image']").attr("content")
      const description = ch2("meta[property='og:description']").attr("content")
      const title = ch2("meta[property='og:title']").attr("content")

      const domain = new URL(url).origin
      // console.log({title})
      // console.log({description})
      // console.log({image})
      // console.log({domain})

      let template = `<a href="${url}" title="${title}" class="blogcard-wrap internal-blogcard-wrap a-wrap cf">
         <div class="blogcard internal-blogcard ib-left cf">
           <div class="blogcard-label internal-blogcard-label">
             <span class="fa"></span>
           </div>
           <figure class="blogcard-thumbnail internal-blogcard-thumbnail">
             <img src="${image}" alt="" class=" internal-blogcard-thumb-image" width="160" height="90" loading="lazy" decoding="async" />
           </figure>
           <div class="blogcard-content internal-blogcard-content">
             <div class="blogcard-title internal-blogcard-title">
             ${title}
             </div>
             <div class="blogcard-snippet internal-blogcard-snippet">
             ${description}
             </div>
           </div>
           <div class="blogcard-footer internal-blogcard-footer cf">
             <div class="blogcard-site internal-blogcard-site">
               <div class="blogcard-favicon internal-blogcard-favicon">
                 <img src="https://www.google.com/s2/favicons?domain=${url}" alt="" class="blogcard-favicon-image internal-blogcard-favicon-image" width="16" height="16" loading="lazy" decoding="async" />
               </div>
               <div class="blogcard-domain internal-blogcard-domain">
               ${domain}
               </div>
             </div>
           </div>
         </div>
       </a>`;
      //  console.log({template})

      //
      ch(as[i]).replaceWith(template);

    } catch (ex) {
      console.log({ ex })
    }




  }

  // restore html
  context.debug(`[08S] update html`);
  postData["content"] = ch.html(ch("body > *"), { decodeEntities: false });
  context.debug(`[08E] updated html`);


  console.log(postData.content)
  // vscode.window.showInformationMessage("dev complete.");





  // featured image upload
  if (!postData["featured_media"]) {
    context.debug(`[09S] upload featured image`);
    const imgPath = findLocalFeaturedImage(context, docParsedPath);
    if (imgPath === "") {
      const defaultId = context.getDefaultFeaturedImageId();
      if (defaultId >= 0) {
        postData["featured_media"] = context.getDefaultFeaturedImageId();
        context.debug(`[09E] has no image id: ${postData["featured_media"]}`);
      } else {
        context.debug(`[09E] has no image id (not set)`);
      }
    } else {
      const imgSlug = context.getFeaturedImageSlug(postData["slug"]);
      context.debug(`[09I] upload featured image : ${imgPath} as ${imgSlug}`);
      const imgItem = await uploadImage(context, imgSlug, imgPath);
      postData["featured_media"] = imgItem["id"];
      context.debug(`[09E] uploaded image id: ${postData["featured_media"]}`);
    }
  }

  // post
  context.debug(`[10S] post document`);
  const postItem = await getWpItem(
    context,
    "posts",
    { slug: postData["slug"], status: "publish,future,draft,pending,private" },
    false
  );
  let postUrl = context.getUrl("posts");
  if (postItem) {
    postUrl = `${postUrl}/${postItem["id"]}/`;
    context.debug(`[10I] update post id : ${postItem["id"]}`);
  } else {
    context.debug(`[10I] new post`);
  }
  const res = await axios({
    url: postUrl,
    method: `POST`,
    data: postData,
    auth: context.getAuth(),
  });
  const msg = `Finished posting to WordPress. id = ${res.data["id"]}`;
  context.debug(`[10E] ${msg}`);
  vscode.window.showInformationMessage(msg);

  // end
  context.debug(`[00E] post end`);
};

/**
 * upload image to wordpess
 */
const uploadImage = async (context: Context, slug: string, imgPath: string) => {
  // path
  const imgParsedPath = path.parse(imgPath);

  // find image from wordpress, if exists return this item
  const item = await getWpItem(context, "media", { slug: slug }, false);
  if (item) {
    return item;
  }

  // if not exists local image, error
  if (!fs.existsSync(imgPath)) {
    throw new Error(`Not found local image file : ${imgPath}`);
  }

  // create header
  const headers: { [name: string]: string } = {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "Content-Type": context.getMediaType(imgParsedPath.ext),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "Content-Disposition": `attachment; filename=${slug}${imgParsedPath.ext}`,
  };

  // load image
  const imageBin = fs.readFileSync(imgPath);

  // post (upload image)
  const res = await axios({
    url: context.getUrl("media"),
    method: `POST`,
    headers: headers,
    data: imageBin,
    auth: context.getAuth(),
  });
  return res.data;
};

/**
 * find feature image from local path
 */
const findLocalFeaturedImage = (
  context: Context,
  docParsedPath: path.ParsedPath
) => {
  for (const ext of context.getMediaExtensions()) {
    const imgPath = path.join(docParsedPath.dir, `${docParsedPath.name}${ext}`);
    if (fs.existsSync(imgPath)) {
      return imgPath;
    }
  }
  return "";
};

/**
 * Find item by slug from http request.
 */
const getWpItem = async (
  context: Context,
  label: string,
  params: { [key: string]: string },
  isThrow = true
) => {
  const res = await axios({
    url: context.getUrl(label),
    method: `GET`,
    params: params,
    auth: context.getAuth(),
  });
  if (res.data.length === 1) {
    return res.data[0];
  } else {
    if (isThrow) {
      throw new Error(`${label}=${params["slug"]} is not found or duplicated.`);
    } else {
      return null;
    }
  }
};

const getCurrentDocument = () => {
  // editor
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error("Please call from markdown file.");
  }

  // return document
  return editor.document;
};

async function getImageSize(base: string, src: string) {
  const probe = require('probe-image-size');

  if (src.match(REG_WWWIMG)) {
    const result = await probe(src);
    return [result.width, result.height];
  }

  let data = fs.readFileSync(base + "/" + src);
  let result = probe.sync(data);
  return [result.width, result.height];
};

function calculateImageSize(imgWidth: number, imgHeight: number, maxWidth: number, maxHeight: number): [number, number] {

  if ((imgWidth <= maxWidth) || (maxWidth === 0)) {
    if ((imgHeight <= maxHeight) || (maxHeight === 0)) {
      return [imgWidth, imgHeight];
    } else {
      return [Math.trunc(imgWidth * maxHeight / imgHeight), maxHeight];
    }
  }

  // imgWidth is greater than maxWidth
  if ((imgHeight <= maxHeight) || (maxHeight === 0)) {
    return [maxWidth, Math.trunc(imgHeight * maxWidth / imgWidth)];
  }

  // both imgHeight and imgWidth are greater than maxWidth and maxHeight
  const widthRatio = imgWidth / maxWidth;
  const heightRatio = imgHeight / maxHeight;
  if (widthRatio > heightRatio) {
    return [maxWidth, Math.trunc(imgHeight * maxWidth / imgWidth)];
  } else {
    return [Math.trunc(imgWidth * maxHeight / imgHeight), maxHeight];
  }
};


const escapeHTML = (str: string) => typeof str !== 'string' ? str :
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/, '&quot;')
    .replace(/'/, '&#039;');

const stringFormat = function (template: string, values?: { [key: string]: string | number | null | undefined }): string {
  return !values
    ? template
    : new Function(...Object.keys(values), `return \`${template}\`;`)(...Object.values(values).map(value => value ?? ''));
}

export const check = async (context: Context) => {
  // start


  // start
  context.debug(`[00S] post start`);

  // current document
  context.debug(`[01S] get document`);
  const doc = getCurrentDocument();
  context.debug(`[01E] got document`);

  // document path
  context.debug(`[02S] detect document path`);
  const docPath = doc.fileName;
  const docParsedPath = path.parse(docPath);
  context.debug(`[02E] detected document path: ${docPath}`);

  // check document file extension
  context.debug(`[03S] check file extension`);
  if (docParsedPath.ext !== ".md") {
    const msg = `Not a Markdow file: ${docParsedPath.base}`;
    context.debug(`[03Z] ${msg}`);
    throw new Error(msg);
  }
  context.debug(`[03E] check file extension : ok`);

  // post data
  const postData: { [key: string]: any } = {};

  // text -> frontmatter(markdown.data) and markdown(markdown.content)
  context.debug(`[05S] parse document`);
  const markdown = matter(doc.getText());
  context.debug(`[05E] parsed document`);

  postData["content"] = md.render(markdown.content);
  const parentDir = path.dirname(doc.fileName);


  const ch = cheerio.load(postData["content"]);
  const imgs = ch("img");
  let files1 = []

  for (let i = 0; i < imgs.length; i++) {

    // src attr
    let srcAttr = ch(imgs[i]).attr("src");
    if (!srcAttr) {
      context.debug(`[07I] skip image tag`);
      continue;
    }

    if (srcAttr.match(REG_WWWIMG)) continue;

    const attachedImgPath = path.join(docParsedPath.dir, srcAttr);

    console.log(attachedImgPath, fs.existsSync(attachedImgPath))

    files1.push({
      path: attachedImgPath,
      file: attachedImgPath.replace(parentDir, ""),
      exists: fs.existsSync(attachedImgPath)
    })

  }


  //
  const targets = [".png", ".jpg", ".gif"]

  const listFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(dirent =>
      dirent.isFile() ? [`${dir}/${dirent.name}`] : listFiles(`${dir}/${dirent.name}`)
    );


  console.log('doc.fileName', doc.fileName)
  console.log({ parentDir })
  console.log(listFiles(parentDir))


  //

  let files2 = []
  for (const f of listFiles(parentDir).filter(a => targets.includes(path.extname(a)))) {
    files2.push({
      path: f,
      file: f.replace(parentDir, ""),
      exists: files1.filter(a => a.path == f).length > 0
    })
  }

  const exists1 = files1.filter(a => a.exists).length;
  const noExists1 = files1.filter(a => !a.exists).length;
  const exists2 = files2.filter(a => a.exists).length;
  const noExists2 = files2.filter(a => !a.exists).length;

  //
  let markdownText = "";
  markdownText += `:package: current dir\n`
  markdownText += `${parentDir}\n`

  markdownText += `\n`
  markdownText += stringFormat(context.getPostTest01(), { test: "foo", hoo: "test1" })
  markdownText += `\n`

  console.log("format", stringFormat(context.getPostTest01(), { test: "foo", hoo: "test1" }));



  markdownText += `|   |  |  |\n`
  markdownText += `| - | - |- |\n`
  markdownText += `|:page_facing_up: markdown |:seedling:${exists1} | :exclamation:${noExists1} |\n`
  markdownText += `|:inbox_tray: workspace |:seedling:${exists2} | :exclamation:${noExists2}  | \n`
  markdownText += `\n`

  //
  markdownText += `|    |  :page_facing_up: markdown     |\n`
  markdownText += `| ---- | ---- |\n`
  for (const l of files1) {
    markdownText += `| ${l.exists ? ":seedling:" : ":exclamation:"}   |  ${l.file} | \n`
  }

  //
  markdownText += `\n`

  //
  markdownText += `|     |  :inbox_tray: workspace  |\n`
  markdownText += `| ---- | ---- |\n`
  for (const l of files2) {
    markdownText += `| ${l.exists ? ":seedling:" : ":exclamation:"}   |  ${l.file} | \n`
  }
  //
  let text = md.render(markdownText);

  const panel = vscode.window.createWebviewPanel(
    'Markdown file checker.',
    'Markdown File Checker',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
    }
  );
  panel.webview.html = fs.readFileSync(
    path.join(__dirname, '../static/webview.html'),
    'utf8'
  );
  panel.webview.postMessage({
    command: 'setText',
    payload: text,
  });
  //	listen webview messages
  panel.webview.onDidReceiveMessage(
    (message) => {
      const { command } = message;
      switch (command) {
        case 'copy':
          vscode.env.clipboard.writeText(text).then(() => {
            vscode.window.showInformationMessage(
              'Copied to clipboard successfully!'
            );
          });
          break;
      }
    },
  );

  panel.onDidChangeViewState(
    (e) => {
      const panel = e.webviewPanel;
      if (panel.active) {
        panel.webview.postMessage({
          command: 'setText',
          payload: text,
        });
      }
    },
  );


  //
  vscode.window.showInformationMessage("complete check", 'OK', 'Cancel', 'hoge')
    .then((selected) => {
      console.log({ selected })
    });

  // end
};