class SerialPVI {
   constructor(baud = 9600, parity = 0) {
      this.BAUD = baud
      this.PARITY = parity
      this.PORT = null
   }

   setPort(port) {
      this.PORT = port
   }

   getPort() {
      return this.PORT
   }

   open() {
      return pvi.runInstruction("serial.open", ['"' + this.PORT + '"', '"' + this.BAUD + '"', '"' + this.PARITY + '"']) == 1
   }

   close() {
      return pvi.runInstruction("serial.close", ['"' + this.PORT + '"']) == 1
   }

   isOpen(port = this.PORT) {
      return pvi.runInstruction("serial.isopen", ['"' + port + '"']) == 1
   }

   async ReadData(timeOut = 50) {
      return new Promise((resolve) => {
         setTimeout(() => {
            const response = DAQ.runInstructionS("serial.readbytedata", [this.PORT])
            console.log(`%c${this.PORT} <= ${response}`, 'color: #CCEE55')
            resolve(response)
         }, timeOut)
      })
   }

   async SendBytes(data) {
      return DAQ.runInstructionS("serial.sendbyte", [this.PORT, data]) == 1
   }

   async tryToOpen(port, timeout = 0) {
      return new Promise((resolve) => {

         const monitor = setInterval(() => {
            if (!this.isOpen(port)) {

               if (this.open(port)) {
                  clearInterval(monitor)
                  clearTimeout(timeOut)
                  resolve(true)
               }
            }
         }, 100)

         const timeOut = setTimeout(() => {
            clearInterval(monitor)
            resolve(false)
         }, timeout)
      })
   }

   async tryToSendBytes(request, timeout = 200) {
      return new Promise((resolve) => {

         const monitor = setInterval(() => {
            if (this.SendBytes(request)) {
               console.log(`%c${this.PORT} => ${request}`, 'color: #00EE55')
               clearInterval(monitor)
               clearTimeout(timeOut)
               resolve(true)
            } else {
               console.log(`%c${this.PORT} => ${request}`, 'color: #EE0055')
            }
         }, 20)

         const timeOut = setTimeout(() => {
            clearInterval(monitor)
            resolve(false)
         }, timeout)
      })
   }


   /**
    * 
    * @param {object} reqInfo { request: string, regex: RegExp, readTimeout: number, maxTries: number, tryNumber: number }
    * @returns 
    */
   async portDiscover(reqInfo, openTimeout = 1000) {

      const portList = SerialPVIUtil.getPortList()

      if (portList.length > 0 && portList[0] != '') {

         for (const port of portList) {

            this.setPort(port)
            reqInfo.tryNumber = 1

            if (await this.tryToOpen(port, openTimeout)) {

               const result = await this.reqResMatchBytes(reqInfo)
               if (result.sucess) {
                  return { sucess: true, port: this.getPort() }
               }

            } else {
               console.log(`%c${port} - Impossivel abrir porta`, `color: #EE0066`)
               this.close()
            }
         }

         this.setPort(null)
         return { sucess: false, port: this.getPort() }

      } else {
         this.setPort(null)
         return { sucess: false, port: this.getPort() }
      }
   }

   /**
    * 
    * @param {object} reqInfo { request: string, regex: RegExp, readTimeout: number, maxTries: number, tryNumber: number }
    * @returns 
    */
   async reqResMatchBytes(reqInfo) {

      const { regex } = reqInfo
      const { request } = reqInfo
      const { maxTries } = reqInfo
      const { tryNumber } = reqInfo
      const { readTimeout } = reqInfo

      return new Promise(async (resolve) => {

         let response = null
         let match = null

         await this.tryToSendBytes(request)
         response = await this.ReadData(readTimeout)
         match = response.match(regex)

         if (match) {
            resolve({ sucess: true, response: match })
         } else if (tryNumber < maxTries) {
            reqInfo.tryNumber++
            resolve(this.reqResMatchBytes(reqInfo))
         } else {
            resolve({ sucess: false, response: null })
         }
      })
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

   async Manager() {
      if (this.hasReqToSend() && this.Processing) {

         const nextReq = this.GetReq()
         const result = await this.reqResMatchBytes(nextReq)

         nextReq["response"] = result.response
         nextReq["sucess"] = result.sucess

         this.ResBuffer.push(nextReq)
         this.Manager()

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
    * @param {object} reqInfo
    * @returns UniqueID: string
    */
   InsertReq(reqInfo) {
      reqInfo["id"] = crypto.randomUUID()
      this.ReqBuffer.push(reqInfo)
      return reqInfo.id
   }

   /**
    * Busca e remove do buffer de respostas uma resposta baseado no UUID
    * @param {string} searchID 
    * @returns resposta: object
    */
   SearchRes(searchID) {
      let obj = null

      this.ResBuffer.forEach((reqInfo, pos) => {
         const { id } = reqInfo
         if (id == searchID) {
            obj = reqInfo
            const removeRes = this.ResBuffer.splice(pos, 1)
         }
      })
      return obj
   }

   async WatchForResponse(reqInfo, timeOut) {
      return new Promise((resolve) => {
         const id = this.InsertReq(reqInfo)

         const monitor = setInterval(() => {
            const obj = this.SearchRes(id)
            if (obj != null) {
               clearInterval(monitor)
               clearTimeout(monitorTimeOut)
               resolve(obj)
            }
         }, 100)

         const monitorTimeOut = setTimeout(() => {
            clearInterval(monitor)
            resolve(false)
         }, timeOut)
      })
   }

}

class SerialPVIUtil {

   static getPortList() {
      return DAQ.runInstructionS("serial.getportscsv", []).split(";")
   }

   static async closeAllPorts() {
      return new Promise((resolve) => {

         let ports = SerialPVIUtil.getPortList()
         for (const port of ports) {
            console.log(`Fechando porta ${port}: `, pvi.runInstruction("serial.close", ['"' + port + '"']) == 1)
         }
         resolve()
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

   static BinaryToHex(bin) {
      try {
         let hex = Number(parseInt(bin, 2)).toString(16)
         hex = hex.toUpperCase()
         while (hex.length < 4) {
            hex = "0" + hex
         }
         return hex.substring(0, 2) + " " + hex.substring(2)
      } catch (error) {
         console.error("Erro ao converter binario para hexadecimal")
      }
   }

   static DecimalToHex(dec) {
      try {
         let hex = Number(parseInt(dec)).toString(16)
         hex = hex.toUpperCase()
         while (hex.length < 4) {
            hex = "0" + hex
         }
         return hex.substring(0, 2) + " " + hex.substring(2)
      } catch (error) {
         console.error("Erro ao converter decimal para hexadecimal")
      }
   }

   static HextoDecimal(hex) {
      try {
         return Number.parseInt("0x" + hex.replace(/[\t ]/g, ''))
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