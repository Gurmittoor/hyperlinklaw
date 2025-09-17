#!/bin/bash
# Deploy HyperlinkLaw GPU OCR Worker on AWS

set -e

echo "🚀 Deploying HyperlinkLaw GPU OCR Worker to AWS..."

# Configuration
INSTANCE_TYPE=${INSTANCE_TYPE:-g5.xlarge}  # 1x A10G GPU, $1.20/hour
REGION=${AWS_REGION:-us-east-1}
KEY_NAME=${AWS_KEY_NAME:-gpu-ocr-key}
SECURITY_GROUP=${AWS_SECURITY_GROUP:-gpu-ocr-sg}

# Create security group if it doesn't exist
echo "🔒 Setting up security group..."
aws ec2 describe-security-groups --group-names $SECURITY_GROUP --region $REGION >/dev/null 2>&1 || {
    echo "Creating security group: $SECURITY_GROUP"
    aws ec2 create-security-group \
        --group-name $SECURITY_GROUP \
        --description "GPU OCR Worker Security Group" \
        --region $REGION
    
    # Allow SSH and HTTP access
    aws ec2 authorize-security-group-ingress \
        --group-name $SECURITY_GROUP \
        --protocol tcp \
        --port 22 \
        --cidr 0.0.0.0/0 \
        --region $REGION
    
    aws ec2 authorize-security-group-ingress \
        --group-name $SECURITY_GROUP \
        --protocol tcp \
        --port 8000 \
        --cidr 0.0.0.0/0 \
        --region $REGION
}

# User data script for instance setup
cat > user-data.sh << 'EOF'
#!/bin/bash
set -e

echo "🔧 Setting up GPU OCR Worker..."

# Update system
apt-get update
apt-get install -y \
    docker.io \
    docker-compose-plugin \
    nvidia-docker2 \
    git \
    awscli

# Start Docker
systemctl start docker
systemctl enable docker

# Add ubuntu user to docker group
usermod -aG docker ubuntu

# Clone and setup worker
cd /home/ubuntu
git clone https://github.com/yourusername/hl-ocr-worker.git
cd hl-ocr-worker

# Set environment variables (replace with your actual values)
cat > .env << ENVEOF
DB_HOST=your-db-host.amazonaws.com
DB_PORT=5432
DB_NAME=your-db-name
DB_USER=your-db-user
DB_PASSWORD=your-db-password
REDIS_URL=redis://localhost:6379
ENVEOF

# Build and start services
docker-compose up -d --build

echo "✅ GPU OCR Worker deployed successfully!"
echo "🌐 Health check: http://\$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):8000/health"
EOF

# Launch EC2 instance
echo "🚀 Launching EC2 instance..."
INSTANCE_ID=$(aws ec2 run-instances \
    --image-id ami-0c02fb55956c7d316 \
    --instance-type $INSTANCE_TYPE \
    --key-name $KEY_NAME \
    --security-groups $SECURITY_GROUP \
    --user-data file://user-data.sh \
    --region $REGION \
    --query 'Instances[0].InstanceId' \
    --output text)

echo "📋 Instance ID: $INSTANCE_ID"

# Wait for instance to be running
echo "⏳ Waiting for instance to be running..."
aws ec2 wait instance-running --instance-ids $INSTANCE_ID --region $REGION

# Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --region $REGION \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

echo "✅ Deployment complete!"
echo "🌐 Public IP: $PUBLIC_IP"
echo "🔍 Health check: http://$PUBLIC_IP:8000/health"
echo "📊 Monitor logs: ssh -i ~/.ssh/$KEY_NAME.pem ubuntu@$PUBLIC_IP 'cd hl-ocr-worker && docker-compose logs -f'"

# Clean up
rm user-data.sh

echo "🎉 GPU OCR Worker is ready for ultra-fast document processing!"