# Serial PVI

## Instalando

Abra o terminal, e na pasta do script, rode:

```
npm i @libs-scripts-mep/serial-pvi
```

## Desinstalando

Abra o terminal, e na pasta do script, rode:

```
npm uninstall @libs-scripts-mep/serial-pvi
```

# Classe Serial PVI

Classe que permite enviar comandos ao PVI para manipular as portas seriais do sistema.

## Exemplo de uso

```js
//instancia do objeto
const serial = new SerialPVI(9600, 1)

//verifica se existe porta serial setada
if (serial.getComPort()) {

   //requisicao a ser enviada para descoberta de porta serial
   const dataSend = "03 02 01"

   //regex para validacao da resposta
   const regex = new RegExp("00 01 02")

   //realiza procura de porta iterando sobre portas seriais disponiveis no sistema
   serial.getConnectedPortCom(dataSend, regex, (sucess, port) => {
      if (sucess) {

         //seta a porta encontrada
         serial.setPortCom(port)

         //solicita abertura da porta serial
         serial.open(serial.COMPORT)
      } else {
         throw new Error("Impossível encontrar porta COM")
      }
   }, 1000)
}

//requisicao a ser enviada
const req = "04 05 06"

//verifica se a porta esta aberta
if (!serial.isOpen()) {
   serial.open(serial.COMPORT)
}

//envia requisicao
serial.SendData(req)

//realiza leitura do buffer do pvi - possivel resposta referente a requisicao
console.log(serial.ReadData())

//envia uma requisicao e aguarda por resposta esperada em um intervalo especifico
serial.MatchData(req, new RegExp("06 05 04"), (sucess, match) => {
   if (sucess) {
      console.log(match)
   } else {
      throw new Error("Impossível comunicar")
   }
}, 1000, 100, 50)
```

# Classe SerialReqManager

## Exemplo de uso

```js
//instancia do manager com politica de gerenciamento baseado em pilha (default: "Queue")
const reqManager = new SerialReqManager(9600, 0, "Stack")

//possibilita parar processamento de requisicoes do buffer
reqManager.Processing = false
reqManager.Processing = true

//Intervalo de monitoramento de requisicoes quando ocioso
reqManager.ManagerInterval = 100

//passando objeto completo
const token1 = reqManager.InsertReq({ req: "10 12", regex: "12 10", timeOut: 500, interval: 100, timeOutRead: 50 })

//passando objeto parcial
const token2 = reqManager.InsertReq({ req: "10 12", regex: "12 10" })

//monitor da resposta da primeira requisicao inserida
const res1Monitor = setInterval(() => {
   const searchResult = reqManager.SearchRes(token1)

   if (searchResult) {
      clearInterval(res1Monitor)
      console.log(searchResult)
   }
}, 200)

//monitor da resposta da segunda requisicao inserida
const res2Monitor = setInterval(() => {
   const searchResult = reqManager.SearchRes(token2)

   if (searchResult) {
      clearInterval(res2Monitor)
      console.log(searchResult)
   }
}, 200)
```