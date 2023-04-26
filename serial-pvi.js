class SerialPVI {
   constructor(Baud = 9600, Parity = 0, ComPort = null) {
      this.BAUD = Baud
      this.COMPORT = ComPort
      this.PARIDADE = Parity
   }

   setPortCom(ComPort) {
      this.COMPORT = ComPort
   }

   getComPort() {
      return this.COMPORT
   }

   open(com = this.COMPORT, baud = this.BAUD, paridade = this.PARIDADE) {
      return pvi.runInstruction("serial.open", ['"' + com + '"', '"' + baud + '"', '"' + paridade + '"']) == 1
   }

   close(com = this.COMPORT) {
      return pvi.runInstruction("serial.close", ['"' + com + '"']) == 1
   }

   isOpen(com = this.COMPORT) {
      return pvi.runInstruction("serial.isopen", ['"' + com + '"']) == 1
   }

   ReadData(port = this.COMPORT, log = true) {
      let buffer = DAQ.runInstructionS("serial.readbytedata", [port])
      if (log) {
         console.log(`%cPVI <= ${buffer}`, 'color: #FF9900')
      }
      return buffer
   }

   SendData(DataSend, porta = this.COMPORT, log = true) {
      if (log) {
         console.log(`%cPVI => ${DataSend}`, 'color: #00CCCC')
      }
      return DAQ.runInstructionS("serial.sendbyte", [porta, DataSend]) == 1
   }

   /**
    * Procura a porta COM de um dispositivo específico através de uma estrutura de requisição e resposta.
    * @param {string} dataSend Série de bytes a serem enviados
    * @param {RegExp} regex Expressão regular para validar a RESPOSTA (outra série de bytes)
    * @param {function} callback 
    * @param {number} timeOut 
    */
   getConnectedPortCom(dataSend, regex, callback, timeOut = 1000) {

      var portList = SerialPVI.getPortList()
      let indexPort = 0

      let getPort = setInterval(() => {
         if (indexPort < portList.length) {

            var portaAtual = portList[indexPort]

            if (this.open(portaAtual, this.BAUD, this.PARIDADE) == 1) {
               if (this.SendData(dataSend, portaAtual) == 1) {

                  setTimeout(() => {
                     var byteData = this.ReadData(portaAtual).match(regex)

                     if (byteData) {
                        console.log(`%c${portaAtual} Match: ${byteData}`, `color: #00EE66`)
                        this.setPortCom(portaAtual)
                        clearInterval(getPort)
                        callback(true, this.getComPort())

                     } else {
                        console.log(`%c${portaAtual} Unmatch: ${byteData}`, `color: #EE0066`)
                        this.close(portaAtual)
                        indexPort++
                     }
                  }, timeOut * 0.5)

               } else {
                  console.log(`%c${portaAtual} Não foi capaz de enviar requisição`, `color: #EE0066`)
                  this.close(portaAtual)
                  indexPort++
               }

            } else {
               console.log(`%c${portaAtual} Não foi capaz de abrir porta COM`, `color: #EE0066`)
               this.close(portaAtual)
               indexPort++
            }

         } else {
            console.log(`%c$Fim da lista: dispositivo não respondeu.`, `color: #EE0066`)
            clearInterval(getPort)
            callback(false, "null")
         }

      }, timeOut)
   }

   /**
    * 
    * @param {string} request string a ser enviada pelo PVI
    * @param {RegExp} regex utilizado para validar a estrutura da resposta aguardada
    * @param {function} callback 
    * @param {number} timeOut tempo maximo que aguarda uma resposta, caso exceda, retorna falha
    * @param {number} interval intervalo entre uma tentativa e outra
    * @param {number} timeOutReadData tempo que aguarda antes de ler a resposta no buffer do PVI
    */
   MatchData(request, regex, callback, timeOut, interval, timeOutReadData) {

      let response = null
      let match = null

      if (timeOutReadData * 2 <= interval) {

         let reqInterval = setInterval(() => {

            this.SendData(request)

            setTimeout(() => {
               response = this.ReadData(this.COMPORT)
               match = response.match(regex)

               if (match) {
                  clearTimeout(timeOutReq)
                  clearInterval(reqInterval)
                  callback(true, match)
               }
            }, timeOutReadData)

         }, interval)

         let timeOutReq = setTimeout(() => {
            clearInterval(reqInterval)
            callback(false, null)
         }, timeOut)

      } else {
         callback(false, "Timeout de leitura invalido! Precisa ser no minimo duas vezes menor do que o 'interval'")
      }
   }

   /**
    * @returns array de portas COM encontradas pelo PVI
    */
   static getPortList() {
      return DAQ.runInstructionS("serial.getportscsv", []).split(";")
   }

   static closeAllPorts() {
      let ports = SerialPVI.getPortList()
      ports.forEach(port => {
         console.log(`Fechando porta ${port}: `, pvi.runInstruction("serial.close", ['"' + port + '"']) == 1)
      })
   }

   static ConvertAscii(hex) {
      hex = hex.match(/[0-9A-Fa-f]*/g).filter(function (el) {
         return el != ""
      })
      hex = hex.map(function (item) {
         return parseInt(item, 16)
      })
      let bytes = new Uint8Array(hex)
      return new TextDecoder("ASCII", { NONSTANDARD_allowLegacyEncoding: true }).decode(bytes)
   }

   static BinaryToHex(d) {
      try {
         let hex = Number(parseInt(d, 2)).toString(16)
         hex = hex.toUpperCase()
         while (hex.length < 4) {
            hex = "0" + hex
         }
         return hex.substring(0, 2) + " " + hex.substring(2)
      } catch (error) {
         console.error("Erro ao converter binario para hexadecimal")
      }
   }

   static DecimalToHex(d) {
      try {
         let hex = Number(parseInt(d)).toString(16)
         hex = hex.toUpperCase()
         while (hex.length < 4) {
            hex = "0" + hex
         }
         return hex.substring(0, 2) + " " + hex.substring(2)
      } catch (error) {
         console.error("Erro ao converter decimal para hexadecimal")
      }
   }

   static HextoDecimal(d) {
      try {
         return Number.parseInt("0x" + d.replace(/[\t ]/g, ''))
      } catch (error) {
         console.error("Erro ao converter hexadecimal para decimal")
      }

   }

   static hex2bin(hex) {
      try {
         return (parseInt(hex, 16).toString(2)).padStart(8, '0')
      } catch (error) {
         console.error("Erro ao converter hexadecimal para binario")
      }
   }
}

class SerialReqManager extends SerialPVI {

   /**
    * 
    * @param {number} baud
    * @param {number} parity Opcoes: 0, 1
    * @param {string} policy Politica de gerenciamento, opcoes: "Queue" ou "Stack"
    */
   constructor(baud, parity, policy = "Queue") {
      super(baud, parity)

      this.Processing = true
      this.ReqBuffer = []
      this.ResBuffer = []

      this.policyManagement = policy
      this.ManagerInterval = 200

      this.Manager()
   }

   Manager() {
      if (this.hasReqToSend() && this.Processing) {

         const nextReq = this.GetReq()

         const { req } = nextReq
         const { regex } = nextReq
         const { timeOut = 500 } = nextReq
         const { interval = 100 } = nextReq
         const { timeOutRead = 50 } = nextReq

         this.MatchData(req, regex, (sucess, res) => {

            nextReq["res"] = res
            nextReq["sucess"] = sucess

            this.ResBuffer.push(nextReq)
            this.Manager()

         }, timeOut, interval, timeOutRead)

      } else {
         setTimeout(() => {
            this.Manager()
         }, this.ManagerInterval)
      }
   }

   hasReqToSend() {
      return this.ReqBuffer.length > 0
   }

   /**
    * 
    * @returns requisicao: object
    * 
    * Baseado na politica de gerenciamento: pilha, ou fila
    */
   GetReq() {
      if (this.policyManagement == "Queue") {
         return this.ReqBuffer.splice(0, 1)[0]
      } else if (this.policyManagement == "Stack") {
         return this.ReqBuffer.pop()
      } else {
         console.warn(`Invalid policy management assignment!\n\n
         Allowed: 'Queue' and 'Stack'\n\n
         Assigned: ${this.policyManagement}`)
      }
   }

   /**
    * Insere requisicao no buffer de requisicoes
    * @param {object} reqObj
    * @returns UniqueID: string
    */
   InsertReq(reqObj) {
      reqObj["id"] = crypto.randomUUID()
      this.ReqBuffer.push(reqObj)
      return reqObj.id
   }

   /**
    * Busca e remove do buffer de respostas uma resposta baseado no UUID
    * @param {string} searchID 
    * @returns resposta: object
    */
   SearchRes(searchID) {
      let obj = null

      this.ResBuffer.forEach((reqObj, pos) => {
         const { id } = reqObj
         if (id == searchID) {
            obj = reqObj
            const removeRes = this.ResBuffer.splice(pos, 1)
         }
      })
      return obj
   }
}