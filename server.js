import mongoose from "mongoose";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import env from "dotenv";
import Razorpay from 'razorpay'

env.config();

const db = mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("Connected to MongoDB"))
.catch((err) => console.log(err));

const app = express();

app.use(
    cors(
    {
        origin:"*",
    }
));

app.use(bodyParser.urlencoded({ extended: true }));

app.use(bodyParser.json());

app.get("/", (req, res) => {
    res.send("Hello World!");
});

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_TEST || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '',
  })

app.post('/capture-payment' , async (req, res) => {

  const options = {
    amount: 100, // ₹1 = 100 paise
    currency: 'INR',
    receipt: 'receipt#1',
  }
  
  try {
    console.log('Creating order',process.env.RAZORPAY_TEST) 
    const response = await razorpay.orders.create(options)
    console.log(response)
    res
      .status(200)
      .json({
        success:true,
        message:'Payment captured successfully',
        data:response
      })

  } catch (err) {
    console.log('Error while capturing payment : ',err)
    res
      .status(400)
      .json({
        success:false,
        message:'Payment capturing failed'
      })
  }
});

app.post('/razorpay-webhook' ,  async (req, res) => {
  try{
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || ''
    
    const receivedSignature = req.headers['x-razorpay-signature']
    
    const payload = JSON.stringify(req.body)
        
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
    
    if (receivedSignature === expectedSignature) {
      const paymentDetails = req.body.payload.payment.entity

      // Payment successfull handling
      const {id, amount, notes} = paymentDetails

      const {userId, productId, productType} = notes

      const transactionObject = {
        paymentId : id,
        productType : productType,
        productId : productId,
        amount : Math.round(amount/100),
      }
        
      res
        .status(httpStatus.ACCEPTED)
        .json({
            success: true,
          message: 'Webhook received successfully',
        })

    } else {
      res.status(400).json({sucess:true,message:'INVALID_PAYMENT_SIGNATURE'})
    }
  }catch(err){
    console.log('Error while getting webhook request  : ',err)
    res.status(400).json({sucess:false,message:'Error while getting webhook request'})
  }
});

app.listen(8181, () => {
    console.log(`Server is running on port 8181`);
});