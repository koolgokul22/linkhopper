let curr_url;
let favicon_url;
let title;
let alt;
let url_node = document.querySelector(".card-url");
let url_favicon = document.querySelector(".url-favicon");
let copy_btn = document.querySelector("#copy-btn");
let download_btn = document.querySelector("#download-btn");
let title_node = document.querySelector("#qr-title");

document.addEventListener("DOMContentLoaded", function () {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    curr_url = tabs[0].url;
    favicon_url = tabs[0].favIconUrl;
    alt = tabs[0].title;
    title = extractWebSiteName(curr_url);

    const qrCode = new QRCodeStyling({
      width: 300,
      height: 300,
      type: "canvas",
      data: curr_url,
      margin: "5",
      // image: favicon_url,
      dotsOptions: {
        color: "#4267b2",
        type: "rounded",
      },
      backgroundOptions: {
        // color: "#e9ebee",
      },
      imageOptions: {
        crossOrigin: "anonymous",
        margin: 25,
      },
    });

    qrCode.append(document.querySelector(".qr-container"));
    url_node.setAttribute("value", curr_url);

    title_node.textContent = title;

    url_favicon.setAttribute("src", favicon_url);
    url_favicon.setAttribute("alt", alt);

    copy_btn.addEventListener("click", () => copyUrlToClipboard(curr_url));
    download_btn.addEventListener("click", () => downloadQRCode(qrCode));
  });
});

copyUrlToClipboard = (url) => {
  if (navigator?.clipboard) {
    navigator?.clipboard
      ?.writeText(url)
      .then(() => console.log("URL copied to clipboard"))
      .catch((error) => console.error("Error copying URL to clipboard", error));
  }
  return;
};
downloadQRCode = (qrCode) => {
  qrCode.download();
};

extractWebSiteName = (url) => {
  let a = new URL(url);
  let hostName = a.hostname;
  const split_url = hostName?.split(".");
  const name = split_url.length > 2 ? split_url[1] : split_url[0];
  return titleCaseName(name);
};

titleCaseName = (name) => {
  return name?.charAt(0)?.toUpperCase() + name?.slice(1);
};
