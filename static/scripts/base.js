const templates = {
    prompt: document.querySelector("template#template__prompt")
}

let notify = (text) => {
    let notif = document.createElement("DIV")
    notif.classList.add("snackbar")
    notif.innerText = text
    document.body.append(notif)
    setTimeout(() => {notif.remove()}, 2800);
}

let get_cookie = (cName) => {
    const name = cName + "=";
    const cDecoded = decodeURIComponent(document.cookie); //to be careful
    const cArr = cDecoded.split('; ');
    let res;
    cArr.forEach(val => {
        if (val.indexOf(name) === 0) res = val.substring(name.length);
    })
    return res
}

let set_cookie = (name, value) => {
    document.cookie = `${name}=${value};`
}


let delete_cookie = (name) => {
    document.cookie = name + '=; Max-Age=0; path=/;'
}