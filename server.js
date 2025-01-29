import mongoose from "mongoose";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import env from "dotenv";
import Razorpay from 'razorpay'
import fileUpload from 'express-fileupload';
import pkg from  'cloudinary'
import crypto from 'crypto'
const {v2: cloudinary} = pkg

env.config();

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("Connected to MongoDB"))
.catch((err) => console.log(err));

const ProductsSchema = new mongoose.Schema({
    name: String,
    price: String,
    image: String,
    stock: String,
});

const OrdersSchema = new mongoose.Schema({
  order_id: String,
  name: String,
  email: String,
  phone: String,
  items: [{ name: String, quantity: String, price: Number }],
  totalPrice: String,
  address: String,
  pincode: String,
  });

const Products = mongoose.model("Products", ProductsSchema);
const Orders = mongoose.model("Orders", OrdersSchema);

const app = express();

app.use(
    cors(
    {
        origin:['http://localhost:3000','https://mere-bankey-bihari-frontend.vercel.app','https://mere-bankey-bihari-frontend.vercel.app/'],
        methods:['GET','POST','PUT','DELETE'],
    }
));

app.use(
  fileUpload({
    useTempFiles: true	})
);

app.use(bodyParser.urlencoded({ extended: true }));

app.use(bodyParser.json());

const cloudinaryConnect = () => {
	try {
		cloudinary.config({
			cloud_name: process.env.CLOUD_NAME,
			api_key: process.env.API_KEY,
			api_secret: process.env.API_SECRET,
		});
	} catch (error) {
		console.log(error);
	}
};

cloudinaryConnect()


const uploadImageToCloudinary  = async (file, folder, height, quality) => {
    const options = {folder};
    if(height) {
        options.height = height;
    }
    if(quality) {
        options.quality = quality;
    }
    options.resource_type = "auto";

    return await cloudinary.uploader.upload(file.tempFilePath, options);
}

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_TEST || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '',
  })


// --------------------------Routes---------------------------------------ROUTES----------------------------------------------Routes--------------

app.get("/", (req, res) => {
    res.send("Hello World!");
});

// -----------------------------------------------------------------PRODUCTS------------------------------------------------------------
app.get("/products", async (req, res) => {
  console.log("Getting Products ")
    try {
        const products = await Products.find({});
        res.json(products);
    } catch (error) {
        console.error("Error while fetching products", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post("/add-product", async (req, res) => {
  try {
    console.log("Reached add product")
      const { name, price, stock, description } = req.body;
      let image 
      
      if (req.files && req.files.imageUrl) {
        const image1 = req.files.imageUrl; 
        const result = await uploadImageToCloudinary(image1, 'bankey_bihari')
        image = result.secure_url;
      }

      const product =await Products.create({
        name,
        price,
        image,
        stock,
        description,
      });

      res.json(product);
      } catch (error) {
      console.error("Error while adding product", error);
      res.status(500).json({ error: "Internal Server Error" });
      }
});

app.post("/edit-product/:id", async (req, res) => {
    try {
        const { name, price, image, stock, description } = req.body;
        const {id } = req.params;
        const product = await Products.findById(id);

        if (req.files && req.files.imageUrl) {
          const image1 = req.files.imageUrl; 
          const result = await uploadImageToCloudinary(image1, 'bankey_bihari')
          product.image = result.secure_url;
        }

        product.name = name;
        product.price = price;
        product.stock = stock;
        product.description = description;
        await product.save();
        res.json(product);
    } catch (error) {
        console.error("Error while editing product", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.delete("/delete-product/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Products.findByIdAndDelete(id);
        res.json(product);
    } catch (error) {
        console.error("Error while deleting product", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// -----------------------------------------------------------------ORDERS------------------------------------------------------------
app.get("/orders", async (req, res) => {
  try { 
    const orders = await Orders.find({});
    res.json(orders);
  } catch (error) {
    console.error("Error while fetching orders", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// -----------------------------------------------------------------Razorpay Payment Gateway Integration------------------------------------------------------------
app.post('/capture-payment' , async (req, res) => {
  try {
    const options = {
      amount: 100, // ₹1 = 100 paise
      currency: 'INR',
      receipt: 'receipt#1',
    }

    // const { name , email , phone , address , pincode , items , totalPrice } = req.body
    const orderData = req.body.data
    console.log(orderData)

    console.log('Creating order',process.env.RAZORPAY_TEST) 
    const response = await razorpay.orders.create(options)
    console.log(response)

    await Orders.create({...orderData,order_id:response.id})
    
    orderData.items.forEach(async (item) => {
      const product = await Products.findById(item._id)
      product.stock = product.stock - item.quantity
      await product.save()
    })
    
    console.log('Order created successfully')

  
    res
      .status(200)
      .json({
        success:true,
        message:'Payment request captured successfully',
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
  console.log("reached into webhook")
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
      const {id,order_id, amount, notes , prefill} = paymentDetails

      const {address, items, totalPrice,pincode} = notes
      const {name,email,contact} = prefill

      const orderObject = {
        order_id,
        name,
        email,
        phone:contact,
        items,
        totalPrice : Math.round(amount/100),
        address,
        pincode,
      }
      console.log("ORder object : ", orderObject)
      const orders = await Orders.create(orderObject)
      console.log(orders)
        
      res
        .status(200)
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

app.all('*', (req, res) => {
  console.log("Route Not found ")
  console.log({
    method: req.method,
    url: req.url,
    path: req.path,
    originalUrl: req.originalUrl
  });
    res.status(404).json({ error: "Route not found" });
});

// -----------------------------------------------------------------ADMIN PANEL------------------------------------------------------------

app.listen(8181, () => {
    console.log(`Server is running on port 8181`);
});