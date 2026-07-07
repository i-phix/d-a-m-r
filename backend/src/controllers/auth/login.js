const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../utils/coreSchemas');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).send({ error: 'Email and password are required' });
        }

        const user = await db.User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(401).send({ error: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).send({ error: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role, type: user.type, facilityId: user.facilityId },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        const userResponse = user.toObject();
        delete userResponse.password;

        return res.status(200).send({
            message: 'Login successful',
            token,
            user: userResponse,
        });
    } catch (err) {
        console.error('Error in login:', err);
        return res.status(400).send({ error: err.message });
    }
};

module.exports = login;
